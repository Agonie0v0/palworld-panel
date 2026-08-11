<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { passiveTier, passiveTierLabel } from "@/utils/palPresentation";

const props = defineProps({
  skill: { type: Object, required: true },
  showDescription: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
});

const { locale } = useI18n();
const tier = computed(() => passiveTier(props.skill?.rank));
const tierLabel = computed(() => passiveTierLabel(props.skill?.rank, locale.value));
const accessibleLabel = computed(() =>
  [
    props.skill?.name || props.skill?.id,
    tierLabel.value,
    props.showDescription ? props.skill?.description || props.skill?.id : "",
  ]
    .filter(Boolean)
    .join(", "),
);
</script>

<template>
  <article class="pal-passive-badge" :class="[`is-${tier}`, { 'is-compact': compact }]" :aria-label="accessibleLabel">
    <strong>{{ skill.name || skill.id }}</strong>
    <p v-if="showDescription">{{ skill.description || skill.id }}</p>
  </article>
</template>

<style scoped>
.pal-passive-badge {
  --passive-surface: linear-gradient(135deg, #596773 0%, #3f4c58 100%);
  --passive-border: #73818c;
  --passive-ink: #fff;
  --passive-copy: #fff;
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 11px 12px;
  color: var(--passive-ink);
  background: var(--passive-surface);
  border: 1px solid var(--passive-border);
  border-radius: 10px;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 22%),
    inset 0 -1px 0 rgb(0 0 0 / 12%);
}
.pal-passive-badge strong {
  position: relative;
  z-index: 1;
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--passive-ink);
  font-size: 12px;
  line-height: 1.45;
  text-shadow: 0 1px 1px rgb(0 0 0 / 22%);
}
.pal-passive-badge p {
  position: relative;
  z-index: 1;
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  color: var(--passive-copy);
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-line;
  text-shadow: 0 1px 1px rgb(0 0 0 / 18%);
}
.pal-passive-badge::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, rgb(255 255 255 / 7%), transparent 42%, rgb(0 0 0 / 8%));
  content: "";
  pointer-events: none;
}
.pal-passive-badge.is-negative {
  --passive-surface: linear-gradient(135deg, #9b2f48 0%, #6f2036 100%);
  --passive-border: #b64d63;
}
.pal-passive-badge.is-gold {
  --passive-surface: linear-gradient(135deg, #8a5b12 0%, #70480c 100%);
  --passive-border: #c39643;
}
.pal-passive-badge.is-rainbow {
  --passive-surface: linear-gradient(120deg, #8b355f 0%, #654394 26%, #306f9e 52%, #267365 76%, #806019 100%);
  --passive-border: #8e77ad;
}
.pal-passive-badge.is-compact {
  padding: 6px 8px;
  border-radius: 7px;
}
.pal-passive-badge.is-compact strong {
  font-size: 10px;
  line-height: 1.3;
}
.pal-passive-badge.is-compact p {
  margin-top: 3px;
  font-size: 9px;
  line-height: 1.35;
}
.pal-passive-badge {
  display: grid;
  align-content: center;
  overflow: visible;
}
.pal-passive-badge.is-compact {
  min-height: 42px;
  align-content: center;
}
.pal-passive-badge.is-compact strong,
.pal-passive-badge.is-compact p {
  overflow-wrap: anywhere;
  white-space: normal;
}
</style>
