<script setup>
import { computed, ref, watch } from "vue";
import { useDialog, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import { Copy, Key, Refresh, Trash, UserPlus } from "@vicons/tabler";
import ApiService from "@/service/api";

const props = defineProps({ show: { type: Boolean, default: false } });
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const message = useMessage();
const dialog = useDialog();

const activeTab = ref("users");
const loading = ref(false);
const busyId = ref("");
const users = ref([]);
const keys = ref([]);
const showUserForm = ref(false);
const showKeyForm = ref(false);
const createdToken = ref("");
const userForm = ref({ id: "", username: "", password: "", role: "operator" });
const keyForm = ref({ name: "", role: "viewer" });

const copy = computed(() =>
  locale.value === "zh"
    ? {
        title: "管理员与访问权限",
        subtitle:
          "为日常运维创建独立账号，或为自动化脚本签发可撤销的 API Key。主管理员始终保留完整权限。",
        users: "面板账号",
        keys: "API Key",
        addUser: "新建账号",
        addKey: "签发 API Key",
        username: "用户名",
        password: "密码",
        passwordHint: "至少 8 个字符；编辑时留空表示不修改",
        role: "角色",
        admin: "管理员",
        operator: "运维员",
        viewer: "只读",
        integration: "机器人集成",
        primary: "主管理员",
        save: "保存",
        cancel: "取消",
        remove: "删除",
        revoke: "撤销",
        emptyUsers: "没有额外账号",
        emptyKeys: "没有 API Key",
        created: "账号已创建。",
        updated: "账号已更新，原登录令牌已失效。",
        removed: "账号已删除。",
        keyName: "用途名称",
        keyCreated: "API Key 已签发。此密钥只显示一次，请立即保存到调用端。",
        token: "新 API Key",
        copied: "已复制。",
        revoked: "API Key 已撤销。",
        lastUsed: "最后使用",
        never: "从未使用",
        createdAt: "创建时间",
        confirmRemove: "该账号将无法继续登录，现有令牌也会失效。",
        confirmRevoke: "撤销后，使用此密钥的脚本会立即失去访问权限。",
      }
    : {
        title: "Administrators and access",
        subtitle:
          "Create separate accounts for daily operations or issue revocable API keys for automation. The primary administrator always keeps full access.",
        users: "Panel accounts",
        keys: "API keys",
        addUser: "New account",
        addKey: "Issue API key",
        username: "Username",
        password: "Password",
        passwordHint:
          "At least 8 characters; leave blank while editing to keep it",
        role: "Role",
        admin: "Administrator",
        operator: "Operator",
        viewer: "Read only",
        integration: "Bot integration",
        primary: "Primary administrator",
        save: "Save",
        cancel: "Cancel",
        remove: "Delete",
        revoke: "Revoke",
        emptyUsers: "No additional accounts",
        emptyKeys: "No API keys",
        created: "Account created.",
        updated:
          "Account updated and its previous login tokens were invalidated.",
        removed: "Account deleted.",
        keyName: "Purpose name",
        keyCreated:
          "API key issued. It is shown only once; store it in the calling application now.",
        token: "New API key",
        copied: "Copied.",
        revoked: "API key revoked.",
        lastUsed: "Last used",
        never: "Never",
        createdAt: "Created",
        confirmRemove:
          "This account will no longer be able to sign in and its active tokens will stop working.",
        confirmRevoke: "Scripts using this key will lose access immediately.",
      },
);

const roleOptions = computed(() => [
  { label: copy.value.admin, value: "admin" },
  { label: copy.value.operator, value: "operator" },
  { label: copy.value.viewer, value: "viewer" },
]);
const keyRoleOptions = computed(() => [
  ...roleOptions.value,
  { label: copy.value.integration, value: "integration" },
]);
const result = (response) => response?.data?.value || {};
const fail = (response, fallback) =>
  message.error(result(response).error || fallback);
const formatTime = (value) =>
  value
    ? new Date(value).toLocaleString(locale.value === "zh" ? "zh-CN" : "en-US")
    : copy.value.never;

const load = async () => {
  loading.value = true;
  try {
    const [userResponse, keyResponse] = await Promise.all([
      api.getAccessUsers(),
      api.getApiKeys(),
    ]);
    if (
      userResponse.statusCode?.value === 403 ||
      keyResponse.statusCode?.value === 403
    ) {
      return fail(
        userResponse.statusCode?.value === 403 ? userResponse : keyResponse,
        "Administrator access required",
      );
    }
    users.value = result(userResponse).users || [];
    keys.value = result(keyResponse).keys || [];
  } finally {
    loading.value = false;
  }
};

const openUser = (user = null) => {
  userForm.value = user
    ? { id: user.id, username: user.name, password: "", role: user.role }
    : { id: "", username: "", password: "", role: "operator" };
  showUserForm.value = true;
};

const saveUser = async () => {
  busyId.value = "user-save";
  try {
    const response = userForm.value.id
      ? await api.updateAccessUser(userForm.value.id, {
          role: userForm.value.role,
          password: userForm.value.password,
        })
      : await api.createAccessUser(userForm.value);
    if (response.statusCode?.value >= 400) return fail(response, "Save failed");
    message.success(
      userForm.value.id ? copy.value.updated : copy.value.created,
    );
    showUserForm.value = false;
    await load();
  } finally {
    busyId.value = "";
  }
};

const removeUser = (user) => {
  dialog.error({
    title: copy.value.remove,
    content: copy.value.confirmRemove,
    positiveText: copy.value.remove,
    negativeText: copy.value.cancel,
    onPositiveClick: async () => {
      const response = await api.deleteAccessUser(user.id);
      if (response.statusCode?.value >= 400)
        return fail(response, "Delete failed");
      message.success(copy.value.removed);
      await load();
    },
  });
};

const createKey = async () => {
  busyId.value = "key-save";
  try {
    const response = await api.createApiKey(keyForm.value);
    if (response.statusCode?.value >= 400)
      return fail(response, "Key creation failed");
    createdToken.value = result(response).token || "";
    showKeyForm.value = false;
    keyForm.value = { name: "", role: "viewer" };
    message.success(copy.value.keyCreated);
    await load();
  } finally {
    busyId.value = "";
  }
};

const copyToken = async () => {
  await navigator.clipboard.writeText(createdToken.value);
  message.success(copy.value.copied);
};

const revokeKey = (key) => {
  dialog.error({
    title: copy.value.revoke,
    content: copy.value.confirmRevoke,
    positiveText: copy.value.revoke,
    negativeText: copy.value.cancel,
    onPositiveClick: async () => {
      const response = await api.revokeApiKey(key.id);
      if (response.statusCode?.value >= 400)
        return fail(response, "Revoke failed");
      message.success(copy.value.revoked);
      await load();
    },
  });
};

watch(
  () => props.show,
  (show) => show && load(),
  { immediate: true },
);
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="access-modal"
    :title="copy.title"
    :bordered="false"
    @update:show="emit('update:show', $event)"
  >
    <template #header-extra>
      <n-button quaternary :loading="loading" @click="load">
        <template #icon
          ><n-icon><Refresh /></n-icon
        ></template>
      </n-button>
    </template>
    <p class="manager-intro">{{ copy.subtitle }}</p>

    <n-alert
      v-if="createdToken"
      type="success"
      closable
      @close="createdToken = ''"
    >
      <template #header>{{ copy.token }}</template>
      <div class="created-key-row">
        <code>{{ createdToken }}</code>
        <n-button circle quaternary :title="copy.copied" @click="copyToken">
          <template #icon
            ><n-icon><Copy /></n-icon
          ></template>
        </n-button>
      </div>
    </n-alert>

    <n-tabs v-model:value="activeTab" type="segment" animated>
      <n-tab-pane name="users" :tab="copy.users">
        <div class="access-toolbar">
          <n-button type="primary" @click="openUser()">
            <template #icon
              ><n-icon><UserPlus /></n-icon></template
            >{{ copy.addUser }}
          </n-button>
        </div>
        <n-empty v-if="users.length <= 1" :description="copy.emptyUsers" />
        <div class="access-list">
          <article v-for="user in users" :key="user.id" class="access-row">
            <div>
              <strong>{{ user.name }}</strong>
              <n-tag v-if="user.primary" size="small">{{ copy.primary }}</n-tag>
            </div>
            <n-tag
              :type="
                user.role === 'admin'
                  ? 'success'
                  : user.role === 'operator'
                    ? 'info'
                    : 'default'
              "
            >
              {{ copy[user.role] }}
            </n-tag>
            <div class="access-row-actions">
              <n-button
                v-if="!user.primary"
                size="small"
                @click="openUser(user)"
                >{{ copy.save }}</n-button
              >
              <n-button
                v-if="!user.primary"
                quaternary
                circle
                type="error"
                :title="copy.remove"
                @click="removeUser(user)"
              >
                <template #icon
                  ><n-icon><Trash /></n-icon
                ></template>
              </n-button>
            </div>
          </article>
        </div>
      </n-tab-pane>

      <n-tab-pane name="keys" :tab="copy.keys">
        <div class="access-toolbar">
          <n-button type="primary" @click="showKeyForm = true">
            <template #icon
              ><n-icon><Key /></n-icon></template
            >{{ copy.addKey }}
          </n-button>
        </div>
        <n-empty v-if="keys.length === 0" :description="copy.emptyKeys" />
        <div class="access-list">
          <article v-for="key in keys" :key="key.id" class="access-row key-row">
            <div>
              <strong>{{ key.name }}</strong>
              <p>
                <code>{{ key.prefix }}...</code> · {{ copy[key.role] }}
              </p>
            </div>
            <div class="key-times">
              <span>{{ copy.createdAt }}: {{ formatTime(key.createdAt) }}</span>
              <span>{{ copy.lastUsed }}: {{ formatTime(key.lastUsedAt) }}</span>
            </div>
            <n-tag v-if="key.revokedAt" type="error">{{ copy.revoked }}</n-tag>
            <n-button
              v-else
              size="small"
              type="error"
              secondary
              @click="revokeKey(key)"
              >{{ copy.revoke }}</n-button
            >
          </article>
        </div>
      </n-tab-pane>
    </n-tabs>
  </n-modal>

  <n-modal
    v-model:show="showUserForm"
    preset="card"
    class="access-form-modal"
    :title="userForm.id ? copy.save : copy.addUser"
  >
    <n-form label-placement="top" :model="userForm">
      <n-form-item v-if="!userForm.id" :label="copy.username"
        ><n-input v-model:value="userForm.username"
      /></n-form-item>
      <n-form-item :label="copy.password"
        ><n-input
          v-model:value="userForm.password"
          type="password"
          show-password-on="click"
          :placeholder="copy.passwordHint"
      /></n-form-item>
      <n-form-item :label="copy.role"
        ><n-select v-model:value="userForm.role" :options="roleOptions"
      /></n-form-item>
    </n-form>
    <template #footer
      ><div class="form-actions">
        <n-button @click="showUserForm = false">{{ copy.cancel }}</n-button
        ><n-button
          type="primary"
          :loading="busyId === 'user-save'"
          @click="saveUser"
          >{{ copy.save }}</n-button
        >
      </div></template
    >
  </n-modal>

  <n-modal
    v-model:show="showKeyForm"
    preset="card"
    class="access-form-modal"
    :title="copy.addKey"
  >
    <n-form label-placement="top" :model="keyForm">
      <n-form-item :label="copy.keyName"
        ><n-input v-model:value="keyForm.name"
      /></n-form-item>
      <n-form-item :label="copy.role"
        ><n-select v-model:value="keyForm.role" :options="keyRoleOptions"
      /></n-form-item>
    </n-form>
    <template #footer
      ><div class="form-actions">
        <n-button @click="showKeyForm = false">{{ copy.cancel }}</n-button
        ><n-button
          type="primary"
          :loading="busyId === 'key-save'"
          @click="createKey"
          >{{ copy.addKey }}</n-button
        >
      </div></template
    >
  </n-modal>
</template>

<style scoped>
:global(.access-modal) {
  width: min(920px, 94vw);
}
:global(.access-form-modal) {
  width: min(500px, 92vw);
}
.manager-intro {
  margin: 0 0 16px;
  color: var(--app-ink-muted);
  font-size: 13px;
}
.created-key-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.created-key-row code {
  flex: 1;
  overflow-wrap: anywhere;
  user-select: all;
}
.access-toolbar {
  display: flex;
  justify-content: flex-end;
  margin: 12px 0;
}
.access-list {
  display: grid;
}
.access-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) auto auto;
  gap: 14px;
  align-items: center;
  min-height: 66px;
  padding: 10px 2px;
  border-bottom: 1px solid var(--app-border);
}
.access-row > div:first-child {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.access-row strong {
  color: var(--app-ink);
}
.access-row p {
  flex-basis: 100%;
  margin: 0;
  color: var(--app-ink-muted);
  font-size: 12px;
}
.access-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.key-row {
  grid-template-columns: minmax(170px, 1fr) minmax(220px, auto) auto;
}
.key-times {
  display: grid;
  color: var(--app-ink-muted);
  font-size: 11px;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
@media (max-width: 680px) {
  :global(.access-modal) {
    width: 100vw;
    max-width: 100vw;
  }
  .access-row,
  .key-row {
    grid-template-columns: 1fr auto;
    align-items: start;
  }
  .key-times {
    grid-column: 1 / -1;
  }
}
</style>
