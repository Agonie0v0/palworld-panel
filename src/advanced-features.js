const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
const Busboy = require("busboy");
const yauzl = require("yauzl");

const MAX_AUDIT_ROWS = 2000;
const MAX_JOB_ROWS = 300;
const MAX_ALERT_ROWS = 300;
const MAX_MONITOR_ROWS = 2880;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 30000;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024 * 1024;

function createAdvancedFeatures(deps) {
  const state = {
    monitorAt: 0,
    scheduleAt: 0,
    runningJobs: new Set(),
  };

  const load = (name, fallback) => deps.loadJsonFile(name, fallback);
  const save = (name, value) => deps.saveJsonFile(name, value);
  const nowIso = () => new Date().toISOString();
  async function prependLimited(name, value, limit) {
    const rows = await load(name, []);
    const next = [value, ...(Array.isArray(rows) ? rows : [])].slice(0, limit);
    await save(name, next);
    return value;
  }

  async function recordAudit(input = {}) {
    return prependLimited(
      "audit-log.json",
      {
        id: crypto.randomUUID(),
        actor: input.actor || "admin",
        role: input.role || "admin",
        action: input.action || "unknown",
        target: input.target || "",
        status: input.status || "success",
        message: input.message || "",
        ip: input.ip || "",
        createdAt: nowIso(),
      },
      MAX_AUDIT_ROWS,
    );
  }

  async function recordAlert(input = {}) {
    return prependLimited(
      "alerts.json",
      {
        id: crypto.randomUUID(),
        severity: input.severity || "warning",
        title: input.title || "Panel alert",
        message: input.message || "",
        source: input.source || "panel",
        status: "open",
        createdAt: nowIso(),
        acknowledgedAt: "",
      },
      MAX_ALERT_ROWS,
    );
  }

  async function updateJob(id, patch) {
    const rows = await load("jobs.json", []);
    const next = (Array.isArray(rows) ? rows : []).map((row) =>
      row.id === id ? { ...row, ...patch, updatedAt: nowIso() } : row,
    );
    await save("jobs.json", next.slice(0, MAX_JOB_ROWS));
    return next.find((row) => row.id === id);
  }

  async function queueJob(type, title, runner, metadata = {}) {
    const job = {
      id: crypto.randomUUID(),
      type,
      title,
      status: "queued",
      progress: 0,
      message: "Queued",
      error: "",
      metadata,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await prependLimited("jobs.json", job, MAX_JOB_ROWS);
    setImmediate(async () => {
      state.runningJobs.add(job.id);
      await updateJob(job.id, { status: "running", progress: 5, message: "Running" });
      try {
        const result = await runner((progress, message, details = {}) =>
          updateJob(job.id, {
            progress: Math.max(0, Math.min(100, Number(progress || 0))),
            message: message || "Running",
            ...(Array.isArray(details.logs) ? { logs: details.logs.slice(-500) } : {}),
          }),
        );
        await updateJob(job.id, {
          status: "completed",
          progress: 100,
          message: result?.message || "Completed",
          result: result || {},
        });
      } catch (error) {
        const message = error?.message || String(error);
        await updateJob(job.id, {
          status: "failed",
          progress: 100,
          message: "Failed",
          error: message,
          ...(Array.isArray(error?.logs) ? { logs: error.logs.slice(-500) } : {}),
          ...(error?.result ? { result: error.result } : {}),
        });
        await recordAlert({
          severity: "error",
          title: `${title} failed`,
          message,
          source: type,
        });
      } finally {
        state.runningJobs.delete(job.id);
      }
    });
    return job;
  }

  function requestIp(req) {
    return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
      .split(",")[0]
      .trim();
  }

  async function auditRequest(req, principal, action, target, runner) {
    try {
      const value = await runner();
      await recordAudit({
        actor: principal?.name,
        role: principal?.role,
        action,
        target,
        status: "success",
        ip: requestIp(req),
      });
      return value;
    } catch (error) {
      await recordAudit({
        actor: principal?.name,
        role: principal?.role,
        action,
        target,
        status: "failed",
        message: error?.message || String(error),
        ip: requestIp(req),
      });
      throw error;
    }
  }

  async function serverLogs(config, lines = 300) {
    const count = Math.max(20, Math.min(5000, Number(lines || 300)));
    if (config.server.mode === "docker" && config.server.containerName) {
      const result = await deps.exec("docker", ["logs", "--tail", String(count), config.server.containerName], {
        timeout: 30000,
      });
      return {
        available: result.ok || Boolean(result.stdout || result.stderr),
        source: "docker",
        logs: [result.stdout, result.stderr].filter(Boolean).join("\n"),
      };
    }
    if (os.platform() === "linux" && config.server.serviceName) {
      const result = await deps.exec(
        "journalctl",
        ["-u", config.server.serviceName, "-n", String(count), "--no-pager", "--output=short-iso"],
        { timeout: 30000 },
      );
      return {
        available: result.ok || Boolean(result.stdout || result.stderr),
        source: "journalctl",
        logs: [result.stdout, result.stderr].filter(Boolean).join("\n"),
      };
    }
    return { available: false, source: "none", logs: "", reason: "Server logs are unavailable on this runtime." };
  }

  async function recordMonitorSample(config) {
    let metrics;
    try {
      metrics = await deps.managedCall("hostMetrics", {}, () => deps.collectHostMetrics(config));
    } catch (error) {
      await recordAlert({
        severity: "warning",
        title: "Host metrics unavailable",
        message: error.message,
        source: "monitor",
      });
      return null;
    }
    const history = await load("monitor-history.json", []);
    const sample = {
      at: nowIso(),
      cpu: Number(metrics?.cpu?.usedPercent || 0),
      memory: Number(metrics?.memory?.usedPercent || 0),
      disk: Number(metrics?.disk?.usedPercent || 0),
      processCpu: Number(metrics?.process?.cpuPercent || 0),
      processMemory: Number(metrics?.process?.memoryPercent || 0),
      processMemoryBytes: Number(metrics?.process?.memoryBytes || 0),
      serviceRunning: Boolean(metrics?.service?.running),
    };
    await save("monitor-history.json", [...(Array.isArray(history) ? history : []), sample].slice(-MAX_MONITOR_ROWS));
    return sample;
  }

  function safeBackupPath(config, name) {
    const base = path.resolve(config.server.backupDir);
    const file = path.resolve(base, path.basename(String(name || "")));
    if (file !== base && !file.startsWith(`${base}${path.sep}`)) throw new Error("Invalid backup name.");
    return file;
  }

  async function sha256File(file) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(file);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(hash.digest("hex")));
    });
  }

  function validArchiveName(name) {
    const normalized = String(name || "").replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return false;
    return !normalized.split("/").some((part) => part === "..");
  }

  async function inspectZip(file) {
    return new Promise((resolve, reject) => {
      yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zip) => {
        if (error) return reject(error);
        let entries = 0;
        let bytes = 0;
        let hasLevel = false;
        zip.readEntry();
        zip.on("entry", (entry) => {
          entries += 1;
          bytes += Number(entry.uncompressedSize || 0);
          const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
          const isSymlink = (unixMode & 0o170000) === 0o120000;
          if (
            entries > MAX_ARCHIVE_ENTRIES ||
            bytes > MAX_ARCHIVE_BYTES ||
            !validArchiveName(entry.fileName) ||
            isSymlink
          ) {
            zip.close();
            return reject(new Error("ZIP archive contains unsafe or excessive entries."));
          }
          if (entry.fileName.toLowerCase().endsWith("level.sav")) hasLevel = true;
          zip.readEntry();
        });
        zip.on("error", reject);
        zip.on("end", () => resolve({ entries, uncompressedBytes: bytes, hasLevel }));
      });
    });
  }

  async function inspectTar(file) {
    const result = await deps.exec("tar", ["-tzf", file], { timeout: 120000 });
    if (!result.ok) throw new Error(result.stderr || result.stdout || "Invalid tar.gz archive.");
    const names = result.stdout.split(/\r?\n/).filter(Boolean);
    if (names.length > MAX_ARCHIVE_ENTRIES || names.some((name) => !validArchiveName(name))) {
      throw new Error("tar.gz archive contains unsafe or excessive entries.");
    }
    return { entries: names.length, uncompressedBytes: 0, hasLevel: names.some((name) => name.toLowerCase().endsWith("level.sav")) };
  }

  async function verifyBackup(config, name) {
    const file = safeBackupPath(config, name);
    const stat = await fsp.stat(file);
    const archive = file.toLowerCase().endsWith(".zip") ? await inspectZip(file) : await inspectTar(file);
    return {
      name: path.basename(file),
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sha256: await sha256File(file),
      ...archive,
      valid: true,
    };
  }

  async function extractZip(file, target) {
    await fsp.mkdir(target, { recursive: true });
    return new Promise((resolve, reject) => {
      yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zip) => {
        if (error) return reject(error);
        let entries = 0;
        let bytes = 0;
        let settled = false;
        const fail = (reason) => {
          if (settled) return;
          settled = true;
          zip.close();
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        };
        zip.readEntry();
        zip.on("entry", async (entry) => {
          try {
            entries += 1;
            bytes += Number(entry.uncompressedSize || 0);
            const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
            const isSymlink = (unixMode & 0o170000) === 0o120000;
            if (
              entries > MAX_ARCHIVE_ENTRIES ||
              bytes > MAX_ARCHIVE_BYTES ||
              !validArchiveName(entry.fileName) ||
              isSymlink
            ) {
              return fail(new Error("ZIP archive contains unsafe or excessive entries."));
            }
            const destination = path.resolve(target, entry.fileName);
            const root = path.resolve(target);
            if (destination !== root && !destination.startsWith(`${root}${path.sep}`)) {
              return fail(new Error("ZIP archive path escaped the extraction directory."));
            }
            if (/\/$/.test(entry.fileName)) {
              await fsp.mkdir(destination, { recursive: true });
              zip.readEntry();
              return;
            }
            await fsp.mkdir(path.dirname(destination), { recursive: true });
            zip.openReadStream(entry, (streamError, input) => {
              if (streamError) return fail(streamError);
              const output = fs.createWriteStream(destination, { flags: "wx" });
              input.on("error", fail);
              output.on("error", fail);
              output.on("finish", () => zip.readEntry());
              input.pipe(output);
            });
          } catch (entryError) {
            fail(entryError);
          }
        });
        zip.on("error", fail);
        zip.on("end", () => {
          if (!settled) {
            settled = true;
            resolve({ entries, uncompressedBytes: bytes });
          }
        });
      });
    });
  }

  async function extractArchive(file, target) {
    if (file.toLowerCase().endsWith(".zip")) return extractZip(file, target);
    const inspection = await inspectTar(file);
    await fsp.mkdir(target, { recursive: true });
    const result = await deps.exec("tar", ["-xzf", file, "-C", target], { timeout: 30 * 60 * 1000 });
    if (!result.ok) throw new Error(result.stderr || result.stdout || "Unable to extract backup.");
    return inspection;
  }

  async function findRestoreRoot(extracted) {
    if (fs.existsSync(path.join(extracted, "SaveGames"))) return extracted;
    const queue = [{ dir: extracted, depth: 0 }];
    while (queue.length) {
      const current = queue.shift();
      if (current.depth > 4) continue;
      for (const entry of await fsp.readdir(current.dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(current.dir, entry.name);
        if (entry.name === "SaveGames") return current.dir;
        queue.push({ dir: child, depth: current.depth + 1 });
      }
    }
    throw new Error("Backup does not contain a SaveGames directory.");
  }

  async function restoreBackupSafe(config, name) {
    await verifyBackup(config, name);
    await deps.managedCall("rcon", { command: "Save" }, () => deps.rcon(config, "Save")).catch(() => {});
    const protection = await deps.createBackup(config);
    if (!protection.ok) throw new Error(protection.stderr || protection.stdout || "Unable to create the pre-restore backup.");

    const saveDir = path.resolve(config.server.saveDir);
    const parent = path.dirname(saveDir);
    const work = await fsp.mkdtemp(path.join(parent, ".palworld-restore-"));
    const extracted = path.join(work, "extracted");
    const previous = `${saveDir}.restore-previous-${Date.now()}`;
    let movedPrevious = false;
    try {
      await extractArchive(safeBackupPath(config, name), extracted);
      const sourceRoot = await findRestoreRoot(extracted);
      const stop = await deps.runAction("stop", config);
      if (!stop.ok) throw new Error(stop.stderr || stop.stdout || "Unable to stop the server.");
      if (fs.existsSync(saveDir)) {
        await fsp.rename(saveDir, previous);
        movedPrevious = true;
      }
      await fsp.rename(sourceRoot, saveDir);
      const start = await deps.runAction("start", config);
      if (!start.ok) throw new Error(start.stderr || start.stdout || "Backup restored, but the server did not start.");
      if (movedPrevious) await fsp.rm(previous, { recursive: true, force: true });
      return {
        ok: true,
        message: "Backup restored and the server restarted.",
        protectionBackup: protection.backup || "",
      };
    } catch (error) {
      if (movedPrevious && fs.existsSync(previous)) {
        await fsp.rm(saveDir, { recursive: true, force: true }).catch(() => {});
        await fsp.rename(previous, saveDir).catch(() => {});
        await deps.runAction("start", config).catch(() => {});
      }
      throw error;
    } finally {
      await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }

  function privateHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  }

  function normalizeWebDavConfig(input = {}, current = {}) {
    const url = String(input.url ?? current.url ?? "").trim().replace(/\/$/, "");
    if (url) {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("WebDAV URL must use HTTP or HTTPS.");
      if (parsed.protocol !== "https:" && !privateHost(parsed.hostname)) {
        throw new Error("Public WebDAV endpoints must use HTTPS.");
      }
    }
    return {
      enabled: Boolean(input.enabled ?? current.enabled),
      url,
      username: String(input.username ?? current.username ?? ""),
      password: input.password ? String(input.password) : String(current.password || ""),
      remotePath: String(input.remotePath ?? current.remotePath ?? "PalworldBackups")
        .replaceAll("\\", "/")
        .replace(/^\/+|\/+$/g, ""),
    };
  }

  function publicWebDavConfig(config = {}) {
    return {
      enabled: Boolean(config.enabled),
      url: config.url || "",
      username: config.username || "",
      passwordSet: Boolean(config.password),
      remotePath: config.remotePath || "PalworldBackups",
    };
  }

  function webDavRequest(method, target, config, body, extraHeaders = {}) {
    const url = new URL(target);
    const transport = url.protocol === "https:" ? https : http;
    const auth = Buffer.from(`${config.username || ""}:${config.password || ""}`).toString("base64");
    return new Promise((resolve, reject) => {
      const request = transport.request(
        url,
        {
          method,
          headers: {
            Authorization: `Basic ${auth}`,
            ...extraHeaders,
          },
          timeout: 120000,
        },
        (response) => {
          let raw = "";
          response.on("data", (chunk) => {
            if (raw.length < 64 * 1024) raw += chunk;
          });
          response.on("end", () => resolve({ status: response.statusCode, body: raw }));
        },
      );
      request.on("timeout", () => request.destroy(new Error("WebDAV request timed out.")));
      request.on("error", reject);
      if (body && typeof body.pipe === "function") body.pipe(request);
      else request.end(body || undefined);
    });
  }

  async function ensureWebDavFolders(config) {
    const base = new URL(`${config.url}/`);
    let current = base.toString().replace(/\/$/, "");
    for (const segment of config.remotePath.split("/").filter(Boolean)) {
      current += `/${encodeURIComponent(segment)}`;
      const result = await webDavRequest("MKCOL", current, config);
      if (![200, 201, 204, 301, 302, 405].includes(result.status)) {
        throw new Error(`Unable to create WebDAV directory (${result.status}).`);
      }
    }
    return current;
  }

  async function testWebDav(config) {
    if (!config.url) throw new Error("WebDAV URL is required.");
    const result = await webDavRequest("PROPFIND", `${config.url}/`, config, "", { Depth: "0" });
    if (![200, 207, 301, 302, 405].includes(result.status)) {
      throw new Error(`WebDAV connection failed (${result.status}).`);
    }
    return { ok: true, status: result.status };
  }

  async function uploadBackupWebDav(config, name, webDavConfig) {
    const file = safeBackupPath(config, name);
    const stat = await fsp.stat(file);
    const directory = await ensureWebDavFolders(webDavConfig);
    const target = `${directory}/${encodeURIComponent(path.basename(file))}`;
    const result = await webDavRequest("PUT", target, webDavConfig, fs.createReadStream(file), {
      "Content-Type": file.endsWith(".zip") ? "application/zip" : "application/gzip",
      "Content-Length": String(stat.size),
    });
    if (![200, 201, 204].includes(result.status)) {
      throw new Error(`WebDAV upload failed (${result.status}).`);
    }
    return { ok: true, name: path.basename(file), target, size: stat.size };
  }

  function receiveUpload(req, prefix) {
    return new Promise((resolve, reject) => {
      const tempDir = path.join(deps.dataDir, "uploads");
      let tempFile = "";
      let originalName = "";
      let bytes = 0;
      let writerPromise = Promise.resolve();
      const fields = {};
      let settled = false;
      fsp
        .mkdir(tempDir, { recursive: true })
        .then(() => {
          const parser = Busboy({
            headers: req.headers,
            limits: { files: 1, fileSize: MAX_UPLOAD_BYTES, fields: 20, parts: 24 },
          });
          parser.on("field", (name, value) => {
            fields[name] = value;
          });
          parser.on("file", (_name, stream, info) => {
            if (tempFile) {
              stream.resume();
              return;
            }
            originalName = path.basename(info.filename || `${prefix}.bin`);
            tempFile = path.join(tempDir, `${prefix}-${crypto.randomUUID()}${path.extname(originalName)}`);
            const output = fs.createWriteStream(tempFile, { flags: "wx" });
            writerPromise = new Promise((writerResolve, writerReject) => {
              stream.on("data", (chunk) => {
                bytes += chunk.length;
              });
              stream.on("limit", () => writerReject(new Error("Uploaded file is too large.")));
              stream.on("error", writerReject);
              output.on("error", writerReject);
              output.on("finish", writerResolve);
            });
            stream.pipe(output);
          });
          parser.on("error", reject);
          parser.on("close", async () => {
            if (settled) return;
            settled = true;
            try {
              await writerPromise;
              if (!tempFile) throw new Error("No file was uploaded.");
              resolve({ tempFile, originalName, bytes, fields });
            } catch (error) {
              if (tempFile) await fsp.rm(tempFile, { force: true }).catch(() => {});
              reject(error);
            }
          });
          req.pipe(parser);
        })
        .catch(reject);
    });
  }

  async function findLevelSav(root) {
    const queue = [{ dir: root, depth: 0 }];
    while (queue.length) {
      const current = queue.shift();
      if (current.depth > 8) continue;
      for (const entry of await fsp.readdir(current.dir, { withFileTypes: true })) {
        const child = path.join(current.dir, entry.name);
        if (entry.isFile() && entry.name.toLowerCase() === "level.sav") return child;
        if (entry.isDirectory()) queue.push({ dir: child, depth: current.depth + 1 });
      }
    }
    return "";
  }

  async function listSaveSources(config) {
    const stored = await load("save-sources.json", []);
    const activePath = path.resolve(config.automation.saveSourcePath || config.server.saveDir);
    const serverPath = path.resolve(config.server.saveDir);
    return [
      {
        id: "server",
        name: "Current server world",
        kind: "server",
        path: serverPath,
        active: activePath === serverPath,
        createdAt: "",
      },
      ...(Array.isArray(stored) ? stored : []).map((source) => ({
        ...source,
        active: path.resolve(source.path) === activePath,
      })),
    ];
  }

  async function importSaveSourceFromArchive(config, uploaded, requestedName) {
    const extension = path.extname(uploaded.originalName).toLowerCase();
    if (extension !== ".zip") throw new Error("Save source uploads must be ZIP archives.");
    const inspection = await inspectZip(uploaded.tempFile);
    if (!inspection.hasLevel) throw new Error("The archive does not contain Level.sav.");
    const sourceRoot = path.join(deps.dataDir, "save-sources");
    const id = crypto.randomUUID();
    const target = path.join(sourceRoot, id);
    await fsp.mkdir(sourceRoot, { recursive: true });
    try {
      await extractZip(uploaded.tempFile, target);
      const level = await findLevelSav(target);
      if (!level) throw new Error("Level.sav could not be located after extraction.");
      const rows = await load("save-sources.json", []);
      const source = {
        id,
        name: String(requestedName || uploaded.fields.name || path.parse(uploaded.originalName).name).slice(0, 120),
        kind: "import",
        path: target,
        levelPath: level,
        size: inspection.uncompressedBytes,
        createdAt: nowIso(),
        indexedAt: "",
      };
      await save("save-sources.json", [source, ...(Array.isArray(rows) ? rows : [])]);
      return source;
    } catch (error) {
      await fsp.rm(target, { recursive: true, force: true }).catch(() => {});
      throw error;
    } finally {
      await fsp.rm(uploaded.tempFile, { force: true }).catch(() => {});
    }
  }

  async function importSaveSourceFromPath(config, sourcePath, requestedName) {
    const resolved = path.resolve(String(sourcePath || ""));
    const stat = await fsp.stat(resolved);
    if (!stat.isDirectory()) throw new Error("Save source path must be a directory.");
    const level = await findLevelSav(resolved);
    if (!level) throw new Error("Level.sav was not found under the selected directory.");
    const rows = await load("save-sources.json", []);
    const existing = (Array.isArray(rows) ? rows : []).find((row) => path.resolve(row.path) === resolved);
    if (existing) return existing;
    const source = {
      id: crypto.randomUUID(),
      name: String(requestedName || path.basename(resolved)).slice(0, 120),
      kind: "linked",
      path: resolved,
      levelPath: level,
      size: 0,
      createdAt: nowIso(),
      indexedAt: "",
    };
    await save("save-sources.json", [source, ...(Array.isArray(rows) ? rows : [])]);
    return source;
  }

  async function activateSaveSource(config, id) {
    const sources = await listSaveSources(config);
    const source = sources.find((row) => row.id === id);
    if (!source) throw new Error("Save source not found.");
    const next = await deps.saveConfig({
      ...config,
      automation: {
        ...config.automation,
        saveSourceMode: "directory",
        saveSourcePath: source.path,
      },
    });
    return { source: { ...source, active: true }, config: next };
  }

  function publicActivatedSource(result) {
    return { source: result?.source || null };
  }

  async function renameSaveSource(id, name) {
    if (id === "server") throw new Error("The current server source cannot be renamed.");
    const rows = await load("save-sources.json", []);
    let found = false;
    const next = (Array.isArray(rows) ? rows : []).map((row) => {
      if (row.id !== id) return row;
      found = true;
      return { ...row, name: String(name || row.name).slice(0, 120) };
    });
    if (!found) throw new Error("Save source not found.");
    await save("save-sources.json", next);
    return next.find((row) => row.id === id);
  }

  async function removeSaveSource(config, id) {
    if (id === "server") throw new Error("The current server source cannot be deleted.");
    const rows = await load("save-sources.json", []);
    const source = (Array.isArray(rows) ? rows : []).find((row) => row.id === id);
    if (!source) throw new Error("Save source not found.");
    if (path.resolve(config.automation.saveSourcePath || config.server.saveDir) === path.resolve(source.path)) {
      await activateSaveSource(config, "server");
    }
    if (source.kind === "import") {
      const managedRoot = path.resolve(deps.dataDir, "save-sources");
      const target = path.resolve(source.path);
      if (target.startsWith(`${managedRoot}${path.sep}`)) {
        await fsp.rm(target, { recursive: true, force: true });
      }
    }
    await save("save-sources.json", (Array.isArray(rows) ? rows : []).filter((row) => row.id !== id));
    return { ok: true };
  }

  function modDirectories(config) {
    const root = path.resolve(config.server.installDir);
    const binaries = os.platform() === "win32" ? "Win64" : "Linux";
    return {
      pak: path.join(root, "Pal", "Content", "Paks", "~mods"),
      logic: path.join(root, "Pal", "Content", "Paks", "LogicMods"),
      ue4ss: path.join(root, "Pal", "Binaries", binaries, "Mods"),
      binaries: path.join(root, "Pal", "Binaries", binaries),
    };
  }

  function modTypeForPath(file, directories) {
    const resolved = path.resolve(file);
    if (resolved.startsWith(path.resolve(directories.logic))) return "logic";
    if (resolved.startsWith(path.resolve(directories.ue4ss))) return "ue4ss";
    if (resolved.startsWith(path.resolve(directories.pak))) return "pak";
    return "binary";
  }

  async function walkFiles(root, depth = 3) {
    if (!fs.existsSync(root)) return [];
    const output = [];
    const queue = [{ dir: root, depth: 0 }];
    while (queue.length) {
      const current = queue.shift();
      for (const entry of await fsp.readdir(current.dir, { withFileTypes: true })) {
        const child = path.join(current.dir, entry.name);
        if (entry.isDirectory() && current.depth < depth) queue.push({ dir: child, depth: current.depth + 1 });
        else if (entry.isFile()) output.push(child);
      }
    }
    return output;
  }

  function modGroupKey(file) {
    return path.basename(file).replace(/\.disabled$/i, "").replace(/\.(pak|utoc|ucas|dll)$/i, "").toLowerCase();
  }

  async function scanMods(config) {
    const directories = modDirectories(config);
    const files = [
      ...(await walkFiles(directories.pak, 1)),
      ...(await walkFiles(directories.logic, 2)),
      ...(await walkFiles(directories.ue4ss, 3)),
    ].filter((file) => /\.(pak|utoc|ucas|dll)(\.disabled)?$/i.test(file));
    const groups = new Map();
    for (const file of files) {
      const key = `${modTypeForPath(file, directories)}:${modGroupKey(file)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(file);
    }
    const registry = await load("mods.json", []);
    const knownByKey = new Map((Array.isArray(registry) ? registry : []).map((row) => [row.key, row]));
    const mods = [];
    for (const [key, paths] of groups) {
      const previous = knownByKey.get(key) || {};
      const stats = await Promise.all(paths.map((file) => fsp.stat(file)));
      mods.push({
        id: previous.id || crypto.randomUUID(),
        key,
        name: previous.name || path.basename(paths[0]).replace(/\.disabled$/i, "").replace(/\.(pak|utoc|ucas|dll)$/i, ""),
        type: key.split(":")[0],
        source: previous.source || "local",
        version: previous.version || "",
        enabled: paths.some((file) => !file.endsWith(".disabled")),
        paths,
        size: stats.reduce((total, stat) => total + stat.size, 0),
        modifiedAt: new Date(Math.max(...stats.map((stat) => stat.mtimeMs))).toISOString(),
        createdAt: previous.createdAt || nowIso(),
      });
    }
    await save("mods.json", mods);
    return { mods, directories };
  }

  function assertModPath(config, target) {
    const roots = Object.values(modDirectories(config)).map((value) => path.resolve(value));
    const resolved = path.resolve(target);
    if (!roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
      throw new Error("Mod path is outside managed directories.");
    }
    return resolved;
  }

  async function setModEnabled(config, id, enabled) {
    const { mods } = await scanMods(config);
    const mod = mods.find((row) => row.id === id);
    if (!mod) throw new Error("Mod not found.");
    for (const current of mod.paths) {
      const file = assertModPath(config, current);
      const target = enabled ? file.replace(/\.disabled$/i, "") : `${file}.disabled`;
      if (target !== file) await fsp.rename(file, target);
    }
    return (await scanMods(config)).mods.find((row) => row.key === mod.key);
  }

  async function deleteMod(config, id) {
    const { mods } = await scanMods(config);
    const mod = mods.find((row) => row.id === id);
    if (!mod) throw new Error("Mod not found.");
    for (const current of mod.paths) await fsp.rm(assertModPath(config, current), { force: true });
    await scanMods(config);
    return { ok: true };
  }

  async function importModUpload(config, uploaded, requestedType) {
    const directories = modDirectories(config);
    const type = ["pak", "logic", "ue4ss"].includes(requestedType) ? requestedType : "pak";
    const target = directories[type];
    await fsp.mkdir(target, { recursive: true });
    const extension = path.extname(uploaded.originalName).toLowerCase();
    try {
      if (extension === ".zip") {
        const staging = await fsp.mkdtemp(path.join(deps.dataDir, "mod-import-"));
        try {
          await extractZip(uploaded.tempFile, staging);
          const files = (await walkFiles(staging, 8)).filter((file) => /\.(pak|utoc|ucas|dll)$/i.test(file));
          if (!files.length) throw new Error("No supported mod files were found in the archive.");
          for (const file of files) {
            await fsp.copyFile(file, path.join(target, path.basename(file)));
          }
        } finally {
          await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
        }
      } else if (/\.(pak|utoc|ucas|dll)$/i.test(extension)) {
        await fsp.copyFile(uploaded.tempFile, path.join(target, uploaded.originalName));
      } else {
        throw new Error("Supported mod uploads are ZIP, PAK, UTOC, UCAS, or DLL files.");
      }
      return scanMods(config);
    } finally {
      await fsp.rm(uploaded.tempFile, { force: true }).catch(() => {});
    }
  }

  function normalizeWorkshopConfig(input = {}, current = {}) {
    const appId = String(input.appId ?? current.appId ?? "1623730").trim();
    if (!/^\d{5,10}$/.test(appId)) throw new Error("Workshop App ID must be numeric.");
    const submittedSteamApiKey = String(input.steamApiKey || "").trim();
    if (submittedSteamApiKey && !/^[A-F0-9]{32}$/i.test(submittedSteamApiKey)) {
      throw new Error("Steam Web API key must contain 32 hexadecimal characters.");
    }
    const translationUrl = String(input.translationUrl ?? current.translationUrl ?? "").replace(/\/$/, "");
    if (translationUrl) {
      const parsed = new URL(translationUrl);
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname))) {
        throw new Error("Translation API must use HTTPS or an HTTP loopback address.");
      }
      if (parsed.username || parsed.password) throw new Error("Translation API URL cannot contain credentials.");
    }
    return {
      appId,
      steamApiKey: submittedSteamApiKey || String(current.steamApiKey || ""),
      translationUrl,
      translationModel: String(input.translationModel ?? current.translationModel ?? "gpt-4.1-mini"),
      translationKey: input.translationKey ? String(input.translationKey) : String(current.translationKey || ""),
    };
  }

  function publicWorkshopConfig(config = {}) {
    return {
      appId: config.appId || "1623730",
      steamApiKeySet: Boolean(config.steamApiKey),
      translationUrl: config.translationUrl || "",
      translationModel: config.translationModel || "gpt-4.1-mini",
      translationKeySet: Boolean(config.translationKey),
    };
  }

  function steamRequest(method, target, body = "", headers = {}) {
    const url = new URL(target);
    if (url.protocol !== "https:" || !url.hostname.endsWith("steampowered.com")) {
      throw new Error("Steam requests must use an official HTTPS endpoint.");
    }
    return new Promise((resolve, reject) => {
      const request = https.request(
        url,
        {
          method,
          headers: { "User-Agent": "palworld-panel", ...headers },
          timeout: 30000,
        },
        (response) => {
          let raw = "";
          response.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 8 * 1024 * 1024) request.destroy(new Error("Steam response is too large."));
          });
          response.on("end", () => {
            if (response.statusCode >= 400) return reject(new Error(`Steam request failed (${response.statusCode}).`));
            try {
              resolve(JSON.parse(raw));
            } catch {
              reject(new Error("Steam returned invalid JSON."));
            }
          });
        },
      );
      request.on("timeout", () => request.destroy(new Error("Steam request timed out.")));
      request.on("error", reject);
      request.end(body || undefined);
    });
  }

  async function workshopSearch(query, page = 1) {
    const config = await load("workshop.json", {});
    if (!config.steamApiKey) throw new Error("A Steam Web API key is required for Workshop search.");
    const url = new URL("https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/");
    url.search = new URLSearchParams({
      key: config.steamApiKey,
      appid: config.appId || "1623730",
      query_type: "3",
      page: String(Math.max(1, Number(page || 1))),
      numperpage: "30",
      search_text: String(query || "").slice(0, 200),
      return_short_description: "true",
      return_previews: "true",
    });
    const response = await steamRequest("GET", url);
    return response.response || {};
  }

  async function workshopDetails(id) {
    if (!/^\d{5,20}$/.test(String(id || ""))) throw new Error("Invalid Workshop item ID.");
    const body = new URLSearchParams({ itemcount: "1", "publishedfileids[0]": String(id) }).toString();
    const response = await steamRequest(
      "POST",
      "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
      body,
      { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    );
    const detail = response.response?.publishedfiledetails?.[0];
    if (!detail || Number(detail.result) !== 1) throw new Error("Workshop item was not found.");
    return detail;
  }

  function safeWorkshopId(id) {
    const value = String(id || "");
    if (!/^\d{5,20}$/.test(value)) {
      throw new Error("Workshop item ID must be a 5-20 digit number.");
    }
    return value;
  }

  function workshopTarget(config, id) {
    return path.join(path.resolve(config.server.installDir), "Mods", "Workshop", safeWorkshopId(id));
  }

  async function listWorkshopMods(config) {
    const rows = await load("workshop-mods.json", []);
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      enabled: fs.existsSync(workshopTarget(config, row.id)),
      installed: fs.existsSync(workshopTarget(config, row.id)) || fs.existsSync(`${workshopTarget(config, row.id)}.disabled`),
    }));
  }

  async function installWorkshopMod(config, id) {
    const safeId = safeWorkshopId(id);
    const detail = await workshopDetails(safeId);
    const workshopConfig = await load("workshop.json", {});
    const appId = workshopConfig.appId || "1623730";
    const steamcmd = config.server.steamcmdPath || "steamcmd";
    const result = await deps.exec(
      steamcmd,
      [
        "+force_install_dir",
        path.resolve(config.server.installDir),
        "+login",
        "anonymous",
        "+workshop_download_item",
        appId,
        safeId,
        "validate",
        "+quit",
      ],
      { timeout: 30 * 60 * 1000 },
    );
    if (!result.ok) throw new Error(result.stderr || result.stdout || "SteamCMD Workshop download failed.");
    const candidates = [
      path.join(path.dirname(steamcmd), "steamapps", "workshop", "content", appId, safeId),
      path.join(path.resolve(config.server.installDir), "steamapps", "workshop", "content", appId, safeId),
      path.join(os.homedir(), ".steam", "steam", "steamapps", "workshop", "content", appId, safeId),
    ];
    const source = candidates.find((candidate) => fs.existsSync(candidate));
    if (!source) throw new Error("SteamCMD completed, but the downloaded Workshop directory could not be located.");
    const target = workshopTarget(config, safeId);
    const staging = `${target}.staging-${Date.now()}`;
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.cp(source, staging, { recursive: true, force: true });
    await fsp.rm(target, { recursive: true, force: true });
    await fsp.rename(staging, target);
    const rows = await load("workshop-mods.json", []);
    const record = {
      id: safeId,
      title: detail.title || String(id),
      previewUrl: detail.preview_url || "",
      updatedAt: nowIso(),
      installedAt: nowIso(),
      pendingRestart: true,
    };
    await save("workshop-mods.json", [record, ...(Array.isArray(rows) ? rows : []).filter((row) => row.id !== safeId)]);
    return record;
  }

  async function setWorkshopModEnabled(config, id, enabled) {
    const active = workshopTarget(config, id);
    const disabled = `${active}.disabled`;
    if (enabled && fs.existsSync(disabled)) await fsp.rename(disabled, active);
    if (!enabled && fs.existsSync(active)) await fsp.rename(active, disabled);
    return listWorkshopMods(config);
  }

  async function deleteWorkshopMod(config, id) {
    await fsp.rm(workshopTarget(config, id), { recursive: true, force: true });
    await fsp.rm(`${workshopTarget(config, id)}.disabled`, { recursive: true, force: true });
    const rows = (await load("workshop-mods.json", [])).filter((row) => row.id !== String(id));
    await save("workshop-mods.json", rows);
    return rows;
  }

  async function translateWorkshop(id, language = "zh-CN") {
    const detail = await workshopDetails(id);
    const config = await load("workshop.json", {});
    if (!config.translationUrl || !config.translationKey) throw new Error("Translation API is not configured.");
    const cache = await load("workshop-translations.json", {});
    const sourceHash = crypto.createHash("sha256").update(`${detail.title}\n${detail.description}`).digest("hex");
    const key = `${id}:${language}:${config.translationModel}:${sourceHash}`;
    if (cache[key]) return cache[key];
    const endpoint = new URL(`${config.translationUrl}/chat/completions`);
    const payload = JSON.stringify({
      model: config.translationModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: `Translate Steam Workshop mod metadata to ${language}. Return JSON with title and description only.` },
        { role: "user", content: JSON.stringify({ title: detail.title, description: detail.description }) },
      ],
      response_format: { type: "json_object" },
    });
    const transport = endpoint.protocol === "https:" ? https : http;
    const response = await new Promise((resolve, reject) => {
      const request = transport.request(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.translationKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 60000,
      }, (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > 2 * 1024 * 1024) request.destroy(new Error("Translation response is too large."));
        });
        res.on("end", () => {
          if (res.statusCode >= 400) return reject(new Error(`Translation API failed (${res.statusCode}).`));
          try { resolve(JSON.parse(raw)); } catch { reject(new Error("Translation API returned invalid JSON.")); }
        });
      });
      request.on("timeout", () => request.destroy(new Error("Translation API timed out.")));
      request.on("error", reject);
      request.end(payload);
    });
    const content = response.choices?.[0]?.message?.content;
    const translated = typeof content === "string" ? JSON.parse(content) : content;
    if (!translated?.title || !translated?.description) throw new Error("Translation response was incomplete.");
    cache[key] = translated;
    await save("workshop-translations.json", cache);
    return translated;
  }

  async function listSchedules() {
    return load("schedules.json", []);
  }

  function nextScheduleRun(schedule, from = Date.now()) {
    const interval = Math.max(1, Number(schedule.intervalMinutes || 60)) * 60 * 1000;
    if (schedule.mode === "daily" && /^\d{2}:\d{2}$/.test(schedule.time || "")) {
      const [hour, minute] = schedule.time.split(":").map(Number);
      const next = new Date(from);
      next.setHours(hour, minute, 0, 0);
      if (next.getTime() <= from) next.setDate(next.getDate() + 1);
      return next.getTime();
    }
    return Number(schedule.lastRun || from) + interval;
  }

  async function executeSchedule(config, schedule) {
    if (schedule.type === "backup") {
      const result = await deps.managedCall("action", { action: "backup" }, () => deps.createBackup(config));
      if (!result.ok) throw new Error(result.stderr || result.stdout || "Backup failed.");
      return result;
    }
    if (schedule.type === "safe-restart") return deps.performManagedRestart(config, "schedule");
    if (schedule.type === "update") {
      const result = await deps.managedCall("action", { action: "update" }, () => deps.runAction("update", config));
      if (!result.ok) throw new Error(result.stderr || result.stdout || "Update failed.");
      return result;
    }
    if (schedule.type === "save-world") {
      const result = await deps.managedCall("rcon", { command: "Save" }, () => deps.rcon(config, "Save"));
      if (!result.ok) throw new Error(result.stderr || result.stdout || "Save command failed.");
      return result;
    }
    if (schedule.type === "rcon") {
      const result = await deps.managedCall("rcon", { command: schedule.command || "" }, () => deps.rcon(config, schedule.command || ""));
      if (!result.ok) throw new Error(result.stderr || result.stdout || "RCON task failed.");
      return result;
    }
    throw new Error("Unsupported schedule type.");
  }

  async function runSchedule(config, id) {
    const schedules = await listSchedules();
    const schedule = schedules.find((row) => row.id === id);
    if (!schedule) throw new Error("Schedule not found.");
    const result = await executeSchedule(config, schedule);
    const now = Date.now();
    const next = schedules.map((row) =>
      row.id === id
        ? { ...row, lastRun: now, nextRun: nextScheduleRun({ ...row, lastRun: now }, now), lastError: "" }
        : row,
    );
    await save("schedules.json", next);
    return result;
  }

  async function tickSchedules(config) {
    const schedules = await listSchedules();
    const now = Date.now();
    let changed = false;
    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      const due = Number(schedule.nextRun || nextScheduleRun(schedule, now));
      if (due > now || state.runningJobs.has(`schedule:${schedule.id}`)) continue;
      state.runningJobs.add(`schedule:${schedule.id}`);
      try {
        await runSchedule(config, schedule.id);
      } catch (error) {
        schedule.lastRun = now;
        schedule.nextRun = nextScheduleRun(schedule, now);
        schedule.lastError = error.message;
        changed = true;
        await recordAlert({ severity: "error", title: `Schedule failed: ${schedule.name}`, message: error.message, source: "schedule" });
      } finally {
        state.runningJobs.delete(`schedule:${schedule.id}`);
      }
    }
    if (changed) await save("schedules.json", schedules);
  }

  async function tick(config) {
    const now = Date.now();
    if (now - state.monitorAt >= 60000) {
      state.monitorAt = now;
      await recordMonitorSample(config).catch(() => {});
    }
    if (now - state.scheduleAt >= 10000) {
      state.scheduleAt = now;
      await tickSchedules(config).catch(() => {});
    }
  }

  async function executeAgentOperation(operation, payload, config) {
    const operations = {
      advancedLogs: () => serverLogs(config, payload.lines),
      advancedVerifyBackup: () => verifyBackup(config, payload.name),
      advancedRestoreBackup: () => restoreBackupSafe(config, payload.name),
      advancedWebDavUpload: () => uploadBackupWebDav(config, payload.name, payload.webdav),
      advancedSaveSources: () => listSaveSources(config),
      advancedSaveSourcePathImport: () => importSaveSourceFromPath(config, payload.path, payload.name),
      advancedSaveSourceActivate: async () => publicActivatedSource(await activateSaveSource(config, payload.id)),
      advancedSaveSourceRename: () => renameSaveSource(payload.id, payload.name),
      advancedSaveSourceDelete: () => removeSaveSource(config, payload.id),
      advancedModsScan: () => scanMods(config),
      advancedModEnable: () => setModEnabled(config, payload.id, payload.enabled),
      advancedModDelete: () => deleteMod(config, payload.id),
      advancedWorkshopList: () => listWorkshopMods(config),
      advancedWorkshopInstall: () => installWorkshopMod(config, payload.id),
      advancedWorkshopEnable: () => setWorkshopModEnabled(config, payload.id, payload.enabled),
      advancedWorkshopDelete: () => deleteWorkshopMod(config, payload.id),
    };
    if (!operations[operation]) throw new Error("Unsupported advanced Agent operation.");
    return operations[operation]();
  }

  async function handleApi(req, res, config, context = {}) {
    const url = new URL(req.url, "http://panel.local");
    const pathname = url.pathname;
    const principal = context.principal || { name: "admin", role: "admin" };

    if (req.method === "GET" && pathname === "/api/advanced/features") {
      deps.sendJson(res, 200, {
        ok: true,
        features: {
          monitorHistory: true,
          serverLogs: true,
          jobs: true,
          alerts: true,
          audit: true,
          schedules: true,
          backupVerify: true,
          backupRestore: true,
          webdav: true,
          saveSources: true,
          mods: true,
          workshop: true,
        },
      });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/logs") {
      const logs = await deps.managedCall(
        "advancedLogs",
        { lines: Number(url.searchParams.get("lines") || 300) },
        () => serverLogs(config, Number(url.searchParams.get("lines") || 300)),
      );
      deps.sendJson(res, 200, { ok: true, logs });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/monitor/history") {
      const rows = await load("monitor-history.json", []);
      const limit = Math.max(10, Math.min(MAX_MONITOR_ROWS, Number(url.searchParams.get("limit") || 360)));
      deps.sendJson(res, 200, { ok: true, history: (Array.isArray(rows) ? rows : []).slice(-limit) });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/jobs") {
      deps.sendJson(res, 200, { ok: true, jobs: await load("jobs.json", []) });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/workshop/config") {
      deps.sendJson(res, 200, { ok: true, config: publicWorkshopConfig(await load("workshop.json", {})) });
      return true;
    }

    if (req.method === "PUT" && pathname === "/api/advanced/workshop/config") {
      const body = await deps.readBody(req);
      const current = await load("workshop.json", {});
      const next = normalizeWorkshopConfig(body.config || body, current);
      await auditRequest(req, principal, "workshop.config.save", next.appId, () => save("workshop.json", next));
      deps.sendJson(res, 200, { ok: true, config: publicWorkshopConfig(next) });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/workshop/search") {
      const result = await workshopSearch(url.searchParams.get("q") || "", url.searchParams.get("page") || 1);
      deps.sendJson(res, 200, { ok: true, result });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/workshop/details") {
      deps.sendJson(res, 200, { ok: true, detail: await workshopDetails(url.searchParams.get("id")) });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/workshop/installed") {
      const mods = await deps.managedCall("advancedWorkshopList", {}, () => listWorkshopMods(config));
      deps.sendJson(res, 200, { ok: true, mods });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/advanced/workshop/install") {
      const body = await deps.readBody(req);
      let safeId;
      try {
        safeId = safeWorkshopId(body.id);
      } catch (error) {
        deps.sendError(res, 400, error.message);
        return true;
      }
      const job = await auditRequest(req, principal, "workshop.install", body.id, () =>
        queueJob("workshop-install", `Install Workshop ${body.id}`, () =>
          deps.managedCall("advancedWorkshopInstall", { id: safeId }, () => installWorkshopMod(config, safeId)),
        ),
      );
      deps.sendJson(res, 202, { ok: true, job });
      return true;
    }

    const workshopAction = pathname.match(/^\/api\/advanced\/workshop\/([^/]+)\/(enable|disable)$/);
    if (req.method === "POST" && workshopAction) {
      let id;
      try {
        id = safeWorkshopId(decodeURIComponent(workshopAction[1]));
      } catch (error) {
        deps.sendError(res, 400, error.message);
        return true;
      }
      const enabled = workshopAction[2] === "enable";
      const mods = await auditRequest(req, principal, `workshop.${workshopAction[2]}`, id, () =>
        deps.managedCall("advancedWorkshopEnable", { id, enabled }, () => setWorkshopModEnabled(config, id, enabled)),
      );
      deps.sendJson(res, 200, { ok: true, mods });
      return true;
    }

    const workshopDelete = pathname.match(/^\/api\/advanced\/workshop\/([^/]+)$/);
    if (req.method === "DELETE" && workshopDelete) {
      let id;
      try {
        id = safeWorkshopId(decodeURIComponent(workshopDelete[1]));
      } catch (error) {
        deps.sendError(res, 400, error.message);
        return true;
      }
      const mods = await auditRequest(req, principal, "workshop.delete", id, () =>
        deps.managedCall("advancedWorkshopDelete", { id }, () => deleteWorkshopMod(config, id)),
      );
      deps.sendJson(res, 200, { ok: true, mods });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/advanced/workshop/translate") {
      const body = await deps.readBody(req);
      deps.sendJson(res, 200, { ok: true, translation: await translateWorkshop(body.id, body.language) });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/alerts") {
      deps.sendJson(res, 200, { ok: true, alerts: await load("alerts.json", []) });
      return true;
    }

    const alertAck = pathname.match(/^\/api\/advanced\/alerts\/([^/]+)\/ack$/);
    if (req.method === "POST" && alertAck) {
      await auditRequest(req, principal, "alert.ack", alertAck[1], async () => {
        const rows = await load("alerts.json", []);
        const next = rows.map((row) =>
          row.id === alertAck[1] ? { ...row, status: "acknowledged", acknowledgedAt: nowIso() } : row,
        );
        await save("alerts.json", next);
      });
      deps.sendJson(res, 200, { ok: true });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/audit") {
      const rows = await load("audit-log.json", []);
      const limit = Math.max(10, Math.min(MAX_AUDIT_ROWS, Number(url.searchParams.get("limit") || 300)));
      deps.sendJson(res, 200, { ok: true, audit: (Array.isArray(rows) ? rows : []).slice(0, limit) });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/schedules") {
      deps.sendJson(res, 200, { ok: true, schedules: await listSchedules() });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/advanced/schedules") {
      const body = await deps.readBody(req);
      const schedules = await listSchedules();
      const schedule = {
        id: body.id || crypto.randomUUID(),
        name: String(body.name || "Scheduled task").slice(0, 120),
        type: body.type || "backup",
        mode: body.mode === "daily" ? "daily" : "interval",
        intervalMinutes: Math.max(1, Number(body.intervalMinutes || 60)),
        time: String(body.time || "04:00"),
        command: String(body.command || ""),
        enabled: Boolean(body.enabled),
        lastRun: Number(body.lastRun || 0),
        nextRun: 0,
        lastError: "",
      };
      schedule.nextRun = nextScheduleRun(schedule);
      const next = [schedule, ...schedules.filter((row) => row.id !== schedule.id)];
      await auditRequest(req, principal, "schedule.save", schedule.id, () => save("schedules.json", next));
      deps.sendJson(res, 200, { ok: true, schedules: next });
      return true;
    }

    const scheduleMatch = pathname.match(/^\/api\/advanced\/schedules\/([^/]+)(\/run)?$/);
    if (scheduleMatch && req.method === "POST" && scheduleMatch[2] === "/run") {
      const job = await auditRequest(req, principal, "schedule.run", scheduleMatch[1], () =>
        queueJob("schedule", "Run scheduled task", () => runSchedule(config, scheduleMatch[1])),
      );
      deps.sendJson(res, 202, { ok: true, job });
      return true;
    }
    if (scheduleMatch && req.method === "DELETE" && !scheduleMatch[2]) {
      const schedules = (await listSchedules()).filter((row) => row.id !== scheduleMatch[1]);
      await auditRequest(req, principal, "schedule.delete", scheduleMatch[1], () => save("schedules.json", schedules));
      deps.sendJson(res, 200, { ok: true, schedules });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/backups/webdav") {
      deps.sendJson(res, 200, { ok: true, webdav: publicWebDavConfig(await load("webdav.json", {})) });
      return true;
    }

    if (req.method === "PUT" && pathname === "/api/advanced/backups/webdav") {
      const body = await deps.readBody(req);
      const current = await load("webdav.json", {});
      const next = normalizeWebDavConfig(body.webdav || body, current);
      await auditRequest(req, principal, "webdav.save", next.url, () => save("webdav.json", next));
      deps.sendJson(res, 200, { ok: true, webdav: publicWebDavConfig(next) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/advanced/backups/webdav/test") {
      const body = await deps.readBody(req);
      const current = await load("webdav.json", {});
      const next = normalizeWebDavConfig(body.webdav || body, current);
      const result = await auditRequest(req, principal, "webdav.test", next.url, () => testWebDav(next));
      deps.sendJson(res, 200, { ok: true, result });
      return true;
    }

    const backupAction = pathname.match(/^\/api\/advanced\/backups\/([^/]+)\/(verify|restore|webdav)$/);
    if (req.method === "POST" && backupAction) {
      const name = decodeURIComponent(backupAction[1]);
      const action = backupAction[2];
      const job = await auditRequest(req, principal, `backup.${action}`, name, async () => {
        if (action === "verify") {
          return queueJob("backup-verify", `Verify ${name}`, async () =>
            deps.managedCall("advancedVerifyBackup", { name }, () => verifyBackup(config, name)),
          );
        }
        if (action === "restore") {
          return queueJob("backup-restore", `Restore ${name}`, async () =>
            deps.managedCall("advancedRestoreBackup", { name }, () => restoreBackupSafe(config, name)),
          );
        }
        const webdav = await load("webdav.json", {});
        if (!webdav.enabled) throw new Error("WebDAV archiving is not enabled.");
        return queueJob("backup-webdav", `Upload ${name}`, async () =>
          deps.managedCall(
            "advancedWebDavUpload",
            { name, webdav },
            () => uploadBackupWebDav(config, name, webdav),
          ),
        );
      });
      deps.sendJson(res, 202, { ok: true, job });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/advanced/save-sources") {
      const sources = await deps.managedCall("advancedSaveSources", {}, () => listSaveSources(config));
      deps.sendJson(res, 200, { ok: true, sources });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/advanced/save-sources/path") {
      const body = await deps.readBody(req);
      const source = await auditRequest(req, principal, "save-source.import-path", body.path, () =>
        deps.managedCall(
          "advancedSaveSourcePathImport",
          { path: body.path, name: body.name },
          () => importSaveSourceFromPath(config, body.path, body.name),
        ),
      );
      deps.sendJson(res, 200, { ok: true, source });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/advanced/save-sources/upload") {
      if (context.agentEnabled) {
        await deps.proxyAgentUpload(req, res, "save-source");
        return true;
      }
      const uploaded = await receiveUpload(req, "save-source");
      const source = await auditRequest(req, principal, "save-source.upload", uploaded.originalName, () =>
        importSaveSourceFromArchive(config, uploaded, uploaded.fields.name),
      );
      deps.sendJson(res, 200, { ok: true, source });
      return true;
    }

    const saveSourceAction = pathname.match(/^\/api\/advanced\/save-sources\/([^/]+)(\/(activate|rebuild))?$/);
    if (saveSourceAction) {
      const id = decodeURIComponent(saveSourceAction[1]);
      const action = saveSourceAction[3];
      if (req.method === "POST" && action === "activate") {
        const result = await auditRequest(req, principal, "save-source.activate", id, () =>
          deps.managedCall(
            "advancedSaveSourceActivate",
            { id },
            async () => publicActivatedSource(await activateSaveSource(config, id)),
          ),
        );
        deps.sendJson(res, 200, { ok: true, result });
        return true;
      }
      if (req.method === "POST" && action === "rebuild") {
        const job = await auditRequest(req, principal, "save-source.rebuild", id, () =>
          queueJob("save-index", "Rebuild save index", async () => {
            const activated = await deps.managedCall(
              "advancedSaveSourceActivate",
              { id },
              () => activateSaveSource(config, id),
            );
            const nextConfig = activated.config || config;
            const data = await deps.managedCall("saveData", {}, () => deps.querySaveData(nextConfig));
            await deps.saveSyncedSaveData(data);
            return { message: "Save source index rebuilt.", source: id };
          }),
        );
        deps.sendJson(res, 202, { ok: true, job });
        return true;
      }
      if (req.method === "PATCH" && !action) {
        const body = await deps.readBody(req);
        const source = await auditRequest(req, principal, "save-source.rename", id, () =>
          deps.managedCall("advancedSaveSourceRename", { id, name: body.name }, () => renameSaveSource(id, body.name)),
        );
        deps.sendJson(res, 200, { ok: true, source });
        return true;
      }
      if (req.method === "DELETE" && !action) {
        const result = await auditRequest(req, principal, "save-source.delete", id, () =>
          deps.managedCall("advancedSaveSourceDelete", { id }, () => removeSaveSource(config, id)),
        );
        deps.sendJson(res, 200, { ok: true, result });
        return true;
      }
    }

    if (req.method === "GET" && pathname === "/api/advanced/mods") {
      const result = await deps.managedCall("advancedModsScan", {}, () => scanMods(config));
      deps.sendJson(res, 200, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/advanced/mods/scan") {
      const result = await auditRequest(req, principal, "mods.scan", "local", () =>
        deps.managedCall("advancedModsScan", {}, () => scanMods(config)),
      );
      deps.sendJson(res, 200, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/advanced/mods/upload") {
      if (context.agentEnabled) {
        await deps.proxyAgentUpload(req, res, "mod");
        return true;
      }
      const uploaded = await receiveUpload(req, "mod");
      const result = await auditRequest(req, principal, "mods.upload", uploaded.originalName, () =>
        importModUpload(config, uploaded, uploaded.fields.type),
      );
      deps.sendJson(res, 200, { ok: true, ...result });
      return true;
    }

    const modAction = pathname.match(/^\/api\/advanced\/mods\/([^/]+)(\/(enable|disable))?$/);
    if (modAction) {
      const id = decodeURIComponent(modAction[1]);
      const action = modAction[3];
      if (req.method === "POST" && action) {
        const mod = await auditRequest(req, principal, `mods.${action}`, id, () =>
          deps.managedCall(
            "advancedModEnable",
            { id, enabled: action === "enable" },
            () => setModEnabled(config, id, action === "enable"),
          ),
        );
        deps.sendJson(res, 200, { ok: true, mod });
        return true;
      }
      if (req.method === "DELETE" && !action) {
        const result = await auditRequest(req, principal, "mods.delete", id, () =>
          deps.managedCall("advancedModDelete", { id }, () => deleteMod(config, id)),
        );
        deps.sendJson(res, 200, { ok: true, result });
        return true;
      }
    }

    return false;
  }

  async function handleAgentUpload(req, res, config, kind) {
    if (kind === "save-source") {
      const uploaded = await receiveUpload(req, "save-source");
      const source = await importSaveSourceFromArchive(config, uploaded, uploaded.fields.name);
      deps.sendJson(res, 200, { ok: true, source });
      return true;
    }
    if (kind === "mod") {
      const uploaded = await receiveUpload(req, "mod");
      const result = await importModUpload(config, uploaded, uploaded.fields.type);
      deps.sendJson(res, 200, { ok: true, ...result });
      return true;
    }
    deps.sendError(res, 404, "Unsupported Agent upload type.");
    return true;
  }

  return {
    handleApi,
    handleAgentUpload,
    executeAgentOperation,
    tick,
    recordAudit,
    recordAlert,
    queueJob,
    verifyBackup,
    restoreBackupSafe,
    serverLogs,
    scanMods,
    listSaveSources,
    __test: {
      validArchiveName,
      normalizeWebDavConfig,
      nextScheduleRun,
      assertModPath,
      inspectZip,
      normalizeWorkshopConfig,
      safeWorkshopId,
    },
  };
}

module.exports = { createAdvancedFeatures };
