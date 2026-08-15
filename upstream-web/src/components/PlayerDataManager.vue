<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, ChevronUp, MapPin, Paw, Refresh, Search, User } from "@vicons/tabler";
import ApiService from "@/service/api";
import ToolSurface from "@/components/ToolSurface.vue";
import { readCachedEntry, requestCached } from "@/utils/requestCache";
import DataFreshness from "@/components/DataFreshness.vue";

const props = defineProps({ show: Boolean, embedded: { type: Boolean, default: false } });
const emit = defineEmits(["update:show"]);
const { locale } = useI18n();
const api = new ApiService();
const loading = ref(false);
const lastUpdatedAt = ref(0);
const error = ref("");
const players = ref([]);
const search = ref("");
const expanded = ref("");
const zh = computed(() => locale.value === "zh");
const copy = computed(() => zh.value ? {
  title: "玩家数据", subtitle: "查看玩家等级、帕鲁图鉴、探索、头目与科技进度。", refresh: "重新解析", updated: "更新时间:",
  search: "搜索玩家名称或 UID", players: "存档玩家", pals: "持有帕鲁", highest: "最高等级",
  player: "玩家", exploration: "探索进度", bosses: "头目进度", last: "末次上线", empty: "没有符合条件的玩家数据",
} : {
  title: "Player data", subtitle: "Inspect player levels, Paldeck, exploration, bosses, and technology progress.", refresh: "Parse again", updated: "Updated:",
  search: "Search player name or UID", players: "Saved players", pals: "Owned Pals", highest: "Highest level",
  player: "Player", exploration: "Exploration", bosses: "Boss progress", last: "Last online", empty: "No matching player data",
});

const visible = computed(() => {
  const query = search.value.trim().toLowerCase();
  return players.value.filter((player) => !query || [player.name, player.nickname, player.player_uid, player.player_id]
    .join(" ").toLowerCase().includes(query)).sort((a, b) => Number(b.level) - Number(a.level));
});
const palTotal = computed(() => players.value.reduce((sum, player) => sum + Number(player.pal_count || player.pals?.length || 0), 0));
const highestLevel = computed(() => Math.max(0, ...players.value.map((player) => Number(player.level || 0))));
const formatDate = (value) => value ? new Intl.DateTimeFormat(zh.value ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
const load = async ({ force = false } = {}) => {
  loading.value = true; error.value = "";
  try {
    const payload = await requestCached("world-data", async () => {
      const response = await api.getWorldData();
      return response?.data?.value || {};
    }, { force });
    lastUpdatedAt.value = readCachedEntry("world-data")?.fetchedAt || 0;
    const data = payload?.data || {};
    players.value = Array.isArray(data.players) ? data.players : [];
  } catch (reason) {
    players.value = []; error.value = reason?.message || "Save data unavailable";
  } finally { loading.value = false; }
};
watch(() => props.show, (show) => show && load(), { immediate: true });
</script>

<template>
  <tool-surface :show="show" class="player-data-modal" :title="copy.title" width="min(96vw, 1240px)" :embedded="embedded" @update:show="emit('update:show', $event)">
    <template #description>{{ copy.subtitle }}</template>
    <template #header-extra><DataFreshness :timestamp="lastUpdatedAt" :label="copy.updated" /><n-button quaternary :loading="loading" @click="load({ force: true })"><template #icon><n-icon><Refresh /></n-icon></template>{{ copy.refresh }}</n-button></template>

    <div class="data-summary">
      <div><n-icon><User /></n-icon><span>{{ copy.players }}</span><strong>{{ players.length }}</strong></div>
      <div><n-icon><Paw /></n-icon><span>{{ copy.pals }}</span><strong>{{ palTotal }}</strong></div>
      <div><n-icon><MapPin /></n-icon><span>{{ copy.highest }}</span><strong>Lv.{{ highestLevel }}</strong></div>
    </div>
    <n-alert v-if="error" type="error" :bordered="false" class="data-error">{{ error }}</n-alert>
    <n-input v-model:value="search" clearable class="data-search" :placeholder="copy.search"><template #prefix><n-icon><Search /></n-icon></template></n-input>

    <div class="player-table" :aria-busy="loading">
      <div class="player-head"><span>{{ copy.player }}</span><span>{{ copy.pals }}</span><span>{{ copy.exploration }}</span><span>{{ copy.bosses }}</span><span>{{ copy.last }}</span><span /></div>
      <div v-for="player in visible" :key="player.player_uid" class="player-group">
        <button class="player-row" type="button" :aria-expanded="expanded === player.player_uid" @click="expanded = expanded === player.player_uid ? '' : player.player_uid">
          <span class="player-identity"><i>{{ (player.name || player.nickname || '?').slice(0, 1) }}</i><span><strong>{{ player.name || player.nickname || player.player_uid }}</strong><small>Lv.{{ player.level }} · {{ player.player_uid }}</small></span></span>
          <span><strong>{{ player.pal_count || player.pals?.length || 0 }}</strong><small>{{ zh ? '图鉴' : 'Paldeck' }} {{ player.discovered_pals || 0 }} · {{ zh ? '捕获' : 'Captured' }} {{ player.captured_pals || 0 }}</small></span>
          <span><strong>{{ player.fast_travel_points || 0 }} {{ zh ? '处传送' : 'fast travel' }}</strong><small>{{ player.explored_areas || 0 }} {{ zh ? '个区域' : 'areas' }}</small></span>
          <span><strong>{{ player.field_bosses || 0 }} {{ zh ? '野外' : 'field' }} · {{ player.tower_bosses || 0 }} {{ zh ? '高塔' : 'tower' }}</strong><small>{{ player.dungeons || 0 }} {{ zh ? '次地下城' : 'dungeons' }}</small></span>
          <span><strong>{{ formatDate(player.last_online || player.save_last_online) }}</strong></span>
          <n-icon><ChevronUp v-if="expanded === player.player_uid" /><ChevronDown v-else /></n-icon>
        </button>
        <div v-if="expanded === player.player_uid" class="player-detail">
          <div><span>{{ zh ? '科技点' : 'Technology points' }}</span><strong>{{ player.technology_points || 0 }}</strong></div>
          <div><span>{{ zh ? '古代科技点' : 'Ancient technology' }}</span><strong>{{ player.ancient_technology_points || 0 }}</strong></div>
          <div><span>{{ zh ? '已解锁配方' : 'Unlocked recipes' }}</span><strong>{{ player.recipes || 0 }}</strong></div>
          <div><span>{{ zh ? '油田通关' : 'Oil rig clears' }}</span><strong>{{ player.oil_rig_clears || 0 }}</strong></div>
          <div><span>{{ zh ? '当前坐标' : 'Coordinates' }}</span><strong>{{ player.position ? `${player.position.x}, ${player.position.y}` : '-' }}</strong></div>
          <div><span>{{ zh ? '经验值' : 'Experience' }}</span><strong>{{ Number(player.exp || 0).toLocaleString() }}</strong></div>
        </div>
      </div>
      <n-empty v-if="!loading && !visible.length" :description="copy.empty" />
    </div>
  </tool-surface>
</template>

<style scoped>
.data-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 16px; overflow: hidden; background: var(--app-border); border: 1px solid var(--app-border); border-radius: 8px; gap: 1px; }
.data-summary > div { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; min-width: 0; padding: 14px 16px; background: var(--app-surface); }
.data-summary .n-icon { color: var(--app-accent); font-size: 20px; }.data-summary span { color: var(--app-ink-muted); }.data-summary strong { font-family: var(--app-font-data); font-size: 20px; }
.data-error,.data-search { margin-bottom: 14px; }.data-search { width: min(440px, 100%); }
.player-table { overflow: hidden; border: 1px solid var(--app-border); border-radius: 8px; }
.player-head,.player-row { display: grid; grid-template-columns: minmax(220px, 1.35fr) repeat(3, minmax(120px, 1fr)) minmax(150px, .9fr) 24px; gap: 14px; align-items: center; }
.player-head { padding: 10px 16px; color: var(--app-ink-muted); background: var(--app-surface-muted); font-size: 12px; font-weight: 700; }
.player-row { width: 100%; min-height: 76px; padding: 12px 16px; color: var(--app-ink); background: var(--app-surface); border: 0; border-top: 1px solid var(--app-border); cursor: pointer; text-align: left; }
.player-group:first-of-type .player-row { border-top: 0; }.player-row:hover { background: color-mix(in srgb, var(--app-accent-soft) 45%, var(--app-surface)); }
.player-row > span { min-width: 0; }.player-row strong,.player-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.player-row small { margin-top: 4px; color: var(--app-ink-muted); font-size: 11px; }
.player-identity { display: flex; align-items: center; gap: 10px; }.player-identity i { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; color: var(--app-accent); background: var(--app-accent-soft); border-radius: 50%; font-style: normal; font-weight: 800; }
.player-detail { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 1px; padding: 1px 0 0; background: var(--app-border); }.player-detail div { padding: 13px 16px; background: var(--app-surface-muted); }.player-detail span,.player-detail strong { display: block; }.player-detail span { color: var(--app-ink-muted); font-size: 11px; }.player-detail strong { margin-top: 5px; font-family: var(--app-font-data); }
@media (max-width: 850px) { .player-table { overflow-x: auto; }.player-head,.player-row { min-width: 900px; }.player-detail { min-width: 900px; grid-template-columns: repeat(6, 1fr); } }
@media (max-width: 560px) { .data-summary { grid-template-columns: 1fr; }.data-summary > div { padding: 11px 14px; } }
</style>
