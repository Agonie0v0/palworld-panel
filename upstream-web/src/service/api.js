import Service from "./service";

class ApiService extends Service {
  async login(param) {
    let data = param;
    return this.fetch(`/api/login`).post(data).json();
  }

  async getCurrentUser() {
    return this.fetch(`/api/auth/me`).get().json();
  }

  async getAccessUsers() {
    return this.fetch(`/api/access/users`).get().json();
  }

  async createAccessUser(user) {
    return this.fetch(`/api/access/users`).post(user).json();
  }

  async updateAccessUser(id, changes) {
    return this.fetch(`/api/access/users/${encodeURIComponent(id)}`)
      .patch(changes)
      .json();
  }

  async deleteAccessUser(id) {
    return this.fetch(`/api/access/users/${encodeURIComponent(id)}`)
      .delete()
      .json();
  }

  async getApiKeys() {
    return this.fetch(`/api/access/api-keys`).get().json();
  }

  async createApiKey(key) {
    return this.fetch(`/api/access/api-keys`).post(key).json();
  }

  async revokeApiKey(id) {
    return this.fetch(`/api/access/api-keys/${encodeURIComponent(id)}`)
      .delete()
      .json();
  }

  async getConfigStatus() {
    return this.fetch(`/api/config/status`).get().json();
  }

  async initializeConfig(param) {
    return this.fetch(`/api/config/initialize`).post(param).json();
  }

  async getConfig() {
    return this.fetch(`/api/config`).get().json();
  }

  async updateConfig(param) {
    return this.fetch(`/api/config`).put(param).json();
  }

  async listDirectories(path = "") {
    const query = new URLSearchParams({ path }).toString();
    return this.fetch(`/api/config/directories?${query}`).get().json();
  }

  async testSaveConfig(save) {
    return this.fetch(`/api/config/test/save`).post({ save }).json();
  }

  async testRconConfig(rcon) {
    return this.fetch(`/api/config/test/rcon`).post({ rcon }).json();
  }

  async getServerToolInfo() {
    return this.fetch(`/api/server/tool`).get().json();
  }
  async getServerInfo() {
    return this.fetch(`/api/server`).get().json();
  }
  async getServerMetrics() {
    return this.fetch(`/api/server/metrics`).get().json();
  }
  async sendBroadcast(param) {
    let data = param;
    return this.fetch(`/api/server/broadcast`).post(data).json();
  }
  async shutdownServer(param) {
    let data = param;
    return this.fetch(`/api/server/shutdown`).post(data).json();
  }

  async getPlayerList(param) {
    const query = this.generateQuery(param);
    return this.fetch(`/api/player?${query}`).get().json();
  }
  async getOnlinePlayerList() {
    return this.fetch(`/api/online_player`).get().json();
  }
  async getPlayer(param) {
    const { playerUid } = param;
    return this.fetch(`/api/player/${playerUid}`).get().json();
  }
  async kickPlayer(param) {
    const { playerUid } = param;
    return this.fetch(`/api/player/${playerUid}/kick`).post().json();
  }
  async banPlayer(param) {
    const { playerUid } = param;
    return this.fetch(`/api/player/${playerUid}/ban`).post().json();
  }
  async unbanPlayer(param) {
    const { playerUid } = param;
    return this.fetch(`/api/player/${playerUid}/unban`).post().json();
  }

  async getGuildList() {
    return this.fetch(`/api/guild`).get().json();
  }
  async getGuild(param) {
    const { adminPlayerUid } = param;
    return this.fetch(`/api/guild/${adminPlayerUid}`).get().json();
  }

  async getWorldData() {
    return this.fetch(`/api/save-data`).get().json();
  }

  async getWhitelist() {
    return this.fetch(`/api/whitelist`).get().json();
  }

  async addWhitelist(param) {
    let data = param;
    return this.fetch(`/api/whitelist`).post(data).json();
  }

  async removeWhitelist(param) {
    let data = param;
    return this.fetch(`/api/whitelist`).delete(data).json();
  }

  async putWhitelist(param) {
    let data = param;
    return this.fetch(`/api/whitelist`).put(data).json();
  }

  async getRconCommands() {
    return this.fetch(`/api/rcon`).get().json();
  }

  async sendRconCommand(param) {
    let data = param;
    return this.fetch(`/api/rcon/send`).post(data).json();
  }

  async addRconCommand(param) {
    let data = param;
    return this.fetch(`/api/rcon`).post(data).json();
  }

  async putRconCommand(uuid, param) {
    let data = param;
    return this.fetch(`/api/rcon/${uuid}`).put(data).json();
  }

  async removeRconCommand(uuid) {
    return this.fetch(`/api/rcon/${uuid}`).delete().json();
  }

  async getRconTasks() {
    return this.fetch(`/api/rcon/tasks`).get().json();
  }

  async addRconTask(param) {
    return this.fetch(`/api/rcon/tasks`).post(param).json();
  }

  async putRconTask(uuid, param) {
    return this.fetch(`/api/rcon/tasks/${uuid}`).put(param).json();
  }

  async removeRconTask(uuid) {
    return this.fetch(`/api/rcon/tasks/${uuid}`).delete().json();
  }

  async runRconTask(uuid) {
    return this.fetch(`/api/rcon/tasks/${uuid}/run`).post().json();
  }

  async getBackupList(param) {
    const query = this.generateQuery(param);
    return this.fetch(`/api/backup?${query}`).get().json();
  }

  async removeBackup(uuid) {
    return this.fetch(`/api/backup/${uuid}`).delete().json();
  }

  async downloadBackup(uuid) {
    return this.fetch(`/api/backup/${uuid}`).get().blob();
  }

  async getPanelStatus() {
    return this.fetch(`/api/status`).get().json();
  }

  async updateGameSettings(settings) {
    return this.fetch(`/api/settings`).put({ settings }).json();
  }

  async getDeployPlan() {
    return this.fetch(`/api/deploy/plan`).get().json();
  }

  async deployServer(param) {
    return this.fetch(`/api/deploy/server`).post(param).json();
  }

  async runServerAction(action) {
    return this.fetch(`/api/action`).post({ action }).json();
  }

  async resetWorld(param) {
    return this.fetch(`/api/server/reset-world`).post(param).json();
  }

  async uninstallServer(param) {
    return this.fetch(`/api/server/uninstall`).post(param).json();
  }

  async getAgentConfig() {
    return this.fetch(`/api/agent/config`).get().json();
  }

  async updateAgentConfig(agent) {
    return this.fetch(`/api/agent/config`).put({ agent }).json();
  }

  async testAgent() {
    return this.fetch(`/api/agent/test`).post({}).json();
  }

  async getHostMetrics() {
    return this.fetch(`/api/host/metrics`).get().json();
  }

  async getWatchdog() {
    return this.fetch(`/api/watchdog`).get().json();
  }

  async updateWatchdog(settings) {
    return this.fetch(`/api/watchdog`).put({ settings }).json();
  }

  async getAdvancedFeatures() {
    return this.fetch(`/api/advanced/features`).get().json();
  }

  async getServerLogs(lines = 300) {
    return this.fetch(`/api/advanced/logs?lines=${lines}`).get().json();
  }

  async getMonitorHistory(limit = 360) {
    return this.fetch(`/api/advanced/monitor/history?limit=${limit}`)
      .get()
      .json();
  }

  async getAdvancedJobs() {
    return this.fetch(`/api/advanced/jobs`).get().json();
  }

  async getAdvancedAlerts() {
    return this.fetch(`/api/advanced/alerts`).get().json();
  }

  async acknowledgeAlert(id) {
    return this.fetch(`/api/advanced/alerts/${encodeURIComponent(id)}/ack`)
      .post({})
      .json();
  }

  async getAuditLog(limit = 300) {
    return this.fetch(`/api/advanced/audit?limit=${limit}`).get().json();
  }

  async getSchedules() {
    return this.fetch(`/api/advanced/schedules`).get().json();
  }

  async saveSchedule(schedule) {
    return this.fetch(`/api/advanced/schedules`).post(schedule).json();
  }

  async runSchedule(id) {
    return this.fetch(`/api/advanced/schedules/${encodeURIComponent(id)}/run`)
      .post({})
      .json();
  }

  async deleteSchedule(id) {
    return this.fetch(`/api/advanced/schedules/${encodeURIComponent(id)}`)
      .delete()
      .json();
  }

  async verifyBackup(name) {
    return this.fetch(
      `/api/advanced/backups/${encodeURIComponent(name)}/verify`,
    )
      .post({})
      .json();
  }

  async restoreBackup(name) {
    return this.fetch(
      `/api/advanced/backups/${encodeURIComponent(name)}/restore`,
    )
      .post({})
      .json();
  }

  async uploadBackupWebDav(name) {
    return this.fetch(
      `/api/advanced/backups/${encodeURIComponent(name)}/webdav`,
    )
      .post({})
      .json();
  }

  async getWebDavConfig() {
    return this.fetch(`/api/advanced/backups/webdav`).get().json();
  }

  async updateWebDavConfig(webdav) {
    return this.fetch(`/api/advanced/backups/webdav`).put({ webdav }).json();
  }

  async testWebDavConfig(webdav) {
    return this.fetch(`/api/advanced/backups/webdav/test`)
      .post({ webdav })
      .json();
  }

  async getSaveSources() {
    return this.fetch(`/api/advanced/save-sources`).get().json();
  }

  async importSaveSourcePath(path, name) {
    return this.fetch(`/api/advanced/save-sources/path`)
      .post({ path, name })
      .json();
  }

  async uploadSaveSource(file, name) {
    const form = new FormData();
    form.append("file", file);
    form.append("name", name || file.name);
    return this.fetch(`/api/advanced/save-sources/upload`).post(form).json();
  }

  async activateSaveSource(id) {
    return this.fetch(
      `/api/advanced/save-sources/${encodeURIComponent(id)}/activate`,
    )
      .post({})
      .json();
  }

  async rebuildSaveSource(id) {
    return this.fetch(
      `/api/advanced/save-sources/${encodeURIComponent(id)}/rebuild`,
    )
      .post({})
      .json();
  }

  async renameSaveSource(id, name) {
    return this.fetch(`/api/advanced/save-sources/${encodeURIComponent(id)}`)
      .patch({ name })
      .json();
  }

  async deleteSaveSource(id) {
    return this.fetch(`/api/advanced/save-sources/${encodeURIComponent(id)}`)
      .delete()
      .json();
  }

  async getMods() {
    return this.fetch(`/api/advanced/mods`).get().json();
  }

  async scanMods() {
    return this.fetch(`/api/advanced/mods/scan`).post({}).json();
  }

  async uploadMod(file, type = "pak") {
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    return this.fetch(`/api/advanced/mods/upload`).post(form).json();
  }

  async setModEnabled(id, enabled) {
    return this.fetch(
      `/api/advanced/mods/${encodeURIComponent(id)}/${enabled ? "enable" : "disable"}`,
    )
      .post({})
      .json();
  }

  async deleteMod(id) {
    return this.fetch(`/api/advanced/mods/${encodeURIComponent(id)}`)
      .delete()
      .json();
  }

  async getPalDefenderStatus() {
    return this.fetch(`/api/advanced/paldefender/status`).get().json();
  }

  async getPalDefenderRelease() {
    return this.fetch(`/api/advanced/paldefender/release`).get().json();
  }

  async installPalDefender() {
    return this.fetch(`/api/advanced/paldefender/install`).post({}).json();
  }

  async rollbackPalDefender() {
    return this.fetch(`/api/advanced/paldefender/rollback`).post({}).json();
  }

  async getPalDefenderBridge() {
    return this.fetch(`/api/advanced/paldefender/bridge`).get().json();
  }

  async updatePalDefenderBridge(bridge) {
    return this.fetch(`/api/advanced/paldefender/bridge`)
      .put({ bridge })
      .json();
  }

  async getPalDefenderConfig() {
    return this.fetch(`/api/advanced/paldefender/config`).get().json();
  }

  async updatePalDefenderConfig(config) {
    return this.fetch(`/api/advanced/paldefender/config`)
      .put({ config })
      .json();
  }

  async testPalDefender() {
    return this.fetch(`/api/advanced/paldefender/test`).post({}).json();
  }

  async palDefenderRequest(method, path, body) {
    return this.fetch(`/api/advanced/paldefender/proxy`)
      .post({ method, path, body })
      .json();
  }

  async getPalDefenderTemplates() {
    return this.fetch(`/api/advanced/paldefender/templates`).get().json();
  }

  async savePalDefenderTemplate(payload) {
    return this.fetch(`/api/advanced/paldefender/templates`)
      .post(payload)
      .json();
  }

  async getPlayerBans() {
    return this.fetch(`/api/advanced/bans`).get().json();
  }

  async savePlayerBan(payload) {
    return this.fetch(`/api/advanced/bans`).post(payload).json();
  }

  async runPlayerBanAction(playerId, action, payload = {}) {
    return this.fetch(
      `/api/advanced/bans/${encodeURIComponent(playerId)}/${action}`,
    )
      .post(payload)
      .json();
  }

  async deletePlayerBan(playerId) {
    return this.fetch(`/api/advanced/bans/${encodeURIComponent(playerId)}`)
      .delete()
      .json();
  }

  async deletePalDefenderTemplate(id) {
    return this.fetch(
      `/api/advanced/paldefender/templates/${encodeURIComponent(id)}`,
    )
      .delete()
      .json();
  }

  async getBreedingCatalog() {
    return this.fetch(`/api/advanced/breeding/catalog`).get().json();
  }

  async getBreedingResult(payload) {
    return this.fetch(`/api/advanced/breeding/direct`).post(payload).json();
  }

  async getBreedingParents(target) {
    return this.fetch(
      `/api/advanced/breeding/parents?target=${encodeURIComponent(target)}`,
    )
      .get()
      .json();
  }

  async solveBreeding(target, maxSteps = 4) {
    const payload = typeof target === "object" ? target : { target, maxSteps };
    return this.fetch(`/api/advanced/breeding/solve`)
      .post(payload)
      .json();
  }

  async getBreedingJobs() {
    return this.fetch(`/api/advanced/breeding/jobs`).get().json();
  }

  async createBreedingJob(payload) {
    return this.fetch(`/api/advanced/breeding/jobs`).post(payload).json();
  }

  async controlBreedingJob(id, action) {
    return this.fetch(
      `/api/advanced/breeding/jobs/${encodeURIComponent(id)}/${action}`,
    )
      .post({})
      .json();
  }

  async getBreedingHistory() {
    return this.fetch(`/api/advanced/breeding/history`).get().json();
  }

  async getBreedingContainers() {
    return this.fetch(`/api/advanced/breeding/containers`).get().json();
  }

  async saveBreedingContainer(container) {
    return this.fetch(`/api/advanced/breeding/containers`)
      .post(container)
      .json();
  }

  async deleteBreedingContainer(id) {
    return this.fetch(
      `/api/advanced/breeding/containers/${encodeURIComponent(id)}`,
    )
      .delete()
      .json();
  }

  async getBreedingPresets() {
    return this.fetch(`/api/advanced/breeding/presets`).get().json();
  }

  async saveBreedingPreset(preset) {
    return this.fetch(`/api/advanced/breeding/presets`).post(preset).json();
  }

  async deleteBreedingPreset(id) {
    return this.fetch(
      `/api/advanced/breeding/presets/${encodeURIComponent(id)}`,
    )
      .delete()
      .json();
  }

  async getWorkshopConfig() {
    return this.fetch(`/api/advanced/workshop/config`).get().json();
  }

  async updateWorkshopConfig(config) {
    return this.fetch(`/api/advanced/workshop/config`).put({ config }).json();
  }

  async searchWorkshop(query, page = 1) {
    return this.fetch(
      `/api/advanced/workshop/search?q=${encodeURIComponent(query)}&page=${page}`,
    )
      .get()
      .json();
  }

  async getWorkshopDetails(id) {
    return this.fetch(
      `/api/advanced/workshop/details?id=${encodeURIComponent(id)}`,
    )
      .get()
      .json();
  }

  async getInstalledWorkshopMods() {
    return this.fetch(`/api/advanced/workshop/installed`).get().json();
  }

  async installWorkshopMod(id) {
    return this.fetch(`/api/advanced/workshop/install`).post({ id }).json();
  }

  async setWorkshopModEnabled(id, enabled) {
    return this.fetch(
      `/api/advanced/workshop/${encodeURIComponent(id)}/${enabled ? "enable" : "disable"}`,
    )
      .post({})
      .json();
  }

  async deleteWorkshopMod(id) {
    return this.fetch(`/api/advanced/workshop/${encodeURIComponent(id)}`)
      .delete()
      .json();
  }

  async translateWorkshopMod(id, language = "zh-CN") {
    return this.fetch(`/api/advanced/workshop/translate`)
      .post({ id, language })
      .json();
  }

  async getAstrBotConfig() {
    return this.fetch(`/api/advanced/astrbot/config`).get().json();
  }

  async updateAstrBotConfig(config) {
    return this.fetch(`/api/advanced/astrbot/config`).put({ config }).json();
  }

  async getAstrBotPlayers() {
    return this.fetch(`/api/advanced/astrbot/players`).get().json();
  }

  async getAstrBotAccount(qq) {
    return this.fetch(
      `/api/advanced/astrbot/account?qq=${encodeURIComponent(qq)}`,
    )
      .get()
      .json();
  }

  async getAstrBotAccounts() {
    return this.fetch(`/api/advanced/astrbot/accounts`).get().json();
  }

  async manageAstrBotAccount(payload) {
    return this.fetch(`/api/advanced/astrbot/accounts/manage`)
      .post(payload)
      .json();
  }

  async getAstrBotLedger(qq = "") {
    return this.fetch(
      `/api/advanced/astrbot/ledger${qq ? `?qq=${encodeURIComponent(qq)}` : ""}`,
    )
      .get()
      .json();
  }
}

export default ApiService;
