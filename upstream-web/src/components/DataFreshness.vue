<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  timestamp: { type: Number, default: 0 },
  label: { type: String, default: "" },
});
const { locale } = useI18n();
const formatted = computed(() => {
  if (!props.timestamp) return "";
  return new Intl.DateTimeFormat(locale.value === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(props.timestamp));
});
</script>

<template>
  <span v-if="formatted" class="data-freshness" :title="formatted">
    {{ label }} {{ formatted }}
  </span>
</template>

<style scoped>
.data-freshness {
  color: var(--app-ink-muted);
  font-size: 11px;
  line-height: 1.35;
  white-space: nowrap;
}

@media (max-width: 560px) {
  .data-freshness {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
