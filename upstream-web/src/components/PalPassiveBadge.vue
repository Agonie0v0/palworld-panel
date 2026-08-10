<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { passiveTier, passiveTierLabel } from "@/utils/palPresentation";

const props = defineProps({
  skill: { type: Object, required: true },
  showDescription: { type: Boolean, default: true },
});

const { locale } = useI18n();
const tier = computed(() => passiveTier(props.skill?.rank));
const tierLabel = computed(() => passiveTierLabel(props.skill?.rank, locale.value));
</script>

<template>
  <article class="pal-passive-badge" :class="`is-${tier}`">
    <header>
      <strong>{{ skill.name || skill.id }}</strong>
      <span>{{ tierLabel }}</span>
    </header>
    <p v-if="showDescription">{{ skill.description || skill.id }}</p>
  </article>
</template>

<style scoped>
.pal-passive-badge {
  --passive-tone: var(--app-ink-muted);
  min-width: 0;
  padding: 11px 12px;
  background: color-mix(in srgb, var(--passive-tone) 5%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--passive-tone) 24%, var(--app-border));
  border-radius: 10px;
}
.pal-passive-badge header {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.pal-passive-badge strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, var(--passive-tone) 76%, var(--app-ink));
  font-size: 12px;
  line-height: 1.45;
}
.pal-passive-badge header span {
  flex: 0 0 auto;
  padding: 2px 6px;
  color: color-mix(in srgb, var(--passive-tone) 82%, var(--app-ink));
  background: color-mix(in srgb, var(--passive-tone) 12%, var(--app-surface));
  border-radius: 999px;
  font-size: 9px;
  font-weight: 750;
  line-height: 1.5;
}
.pal-passive-badge p {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  color: var(--app-ink-muted);
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-line;
}
.pal-passive-badge.is-negative { --passive-tone: #b43f50; }
.pal-passive-badge.is-gold { --passive-tone: #a36d13; }
.pal-passive-badge.is-rainbow {
  --passive-tone: #7449a6;
  background:
    linear-gradient(var(--app-surface), var(--app-surface)) padding-box,
    conic-gradient(from 125deg, #d44c70, #8d61c5, #357fba, #2e9472, #c18a20, #d44c70) border-box;
  border-color: transparent;
}
</style>
