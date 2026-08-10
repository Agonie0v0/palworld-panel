<script setup>
import { computed } from "vue";
import { Hammer } from "@vicons/tabler";
import collectionIcon from "@/assets/items/worksuitability_addticket_collection.webp";
import coolIcon from "@/assets/items/worksuitability_addticket_cool.webp";
import deforestIcon from "@/assets/items/worksuitability_addticket_deforest.webp";
import emitFlameIcon from "@/assets/items/worksuitability_addticket_emitflame.webp";
import electricityIcon from "@/assets/items/worksuitability_addticket_generateelectricity.webp";
import handcraftIcon from "@/assets/items/worksuitability_addticket_handcraft.webp";
import miningIcon from "@/assets/items/worksuitability_addticket_mining.webp";
import farmingIcon from "@/assets/items/worksuitability_addticket_monsterfarm.webp";
import medicineIcon from "@/assets/items/worksuitability_addticket_productmedicine.webp";
import seedingIcon from "@/assets/items/worksuitability_addticket_seeding.webp";
import transportIcon from "@/assets/items/worksuitability_addticket_transport.webp";
import wateringIcon from "@/assets/items/worksuitability_addticket_watering.webp";
import { workSuitabilityTone } from "@/utils/palPresentation";

const props = defineProps({
  work: { type: Object, required: true },
  label: { type: String, required: true },
  compact: { type: Boolean, default: false },
});

const icons = {
  EmitFlame: emitFlameIcon,
  Watering: wateringIcon,
  Seeding: seedingIcon,
  GenerateElectricity: electricityIcon,
  Handcraft: handcraftIcon,
  Collection: collectionIcon,
  Deforest: deforestIcon,
  Mining: miningIcon,
  ProductMedicine: medicineIcon,
  Cool: coolIcon,
  Transport: transportIcon,
  MonsterFarm: farmingIcon,
};

const normalizedId = computed(() =>
  String(props.work?.id || "").replace(/^EPalWorkSuitability::/i, ""),
);
const icon = computed(() => icons[normalizedId.value] || null);
const tone = computed(() => workSuitabilityTone(normalizedId.value));
const level = computed(() => Math.max(0, Number(props.work?.level || 0)));
const accessibleLabel = computed(() => `${props.label}, Lv.${level.value}`);
</script>

<template>
  <span
    class="pal-work-badge"
    :class="[`is-${tone}`, { 'is-compact': compact }]"
    :aria-label="accessibleLabel"
  >
    <span class="pal-work-badge__icon" aria-hidden="true">
      <img v-if="icon" :src="icon" alt="" decoding="async" draggable="false" />
      <n-icon v-else><Hammer /></n-icon>
    </span>
    <span class="pal-work-badge__copy">
      <strong>{{ label }}</strong>
      <small>Lv.{{ level }}</small>
    </span>
  </span>
</template>

<style scoped>
.pal-work-badge {
  --work-tone: var(--app-accent);
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 7px 10px 7px 7px;
  color: color-mix(in srgb, var(--work-tone) 72%, var(--app-ink));
  background: color-mix(in srgb, var(--work-tone) 10%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--work-tone) 24%, var(--app-border));
  border-radius: 10px;
}
.pal-work-badge__icon {
  position: relative;
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  overflow: hidden;
  place-items: center;
  color: color-mix(in srgb, var(--work-tone) 82%, var(--app-ink));
  background: color-mix(in srgb, var(--work-tone) 18%, var(--app-surface));
  border-radius: 8px;
  font-size: 17px;
}
.pal-work-badge__icon img {
  position: absolute;
  top: calc(50% + 1px);
  left: 50%;
  width: 96px;
  max-width: none;
  height: 96px;
  flex: 0 0 auto;
  object-fit: contain;
  transform: translate(-50%, -50%);
}
.pal-work-badge__copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.pal-work-badge strong {
  overflow: hidden;
  color: var(--app-ink);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pal-work-badge small {
  color: currentColor;
  font: 700 9px var(--app-font-data);
}
.pal-work-badge.is-compact {
  gap: 5px;
  padding: 3px 6px 3px 3px;
  border-radius: 7px;
}
.pal-work-badge.is-compact .pal-work-badge__icon {
  width: 22px;
  height: 22px;
  flex-basis: 22px;
  border-radius: 5px;
  font-size: 13px;
}
.pal-work-badge.is-compact .pal-work-badge__icon img {
  width: 72px;
  height: 72px;
}
.pal-work-badge.is-compact .pal-work-badge__copy {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.pal-work-badge.is-flame { --work-tone: #c25130; }
.pal-work-badge.is-water { --work-tone: #2f6f9f; }
.pal-work-badge.is-plant { --work-tone: #4b7f52; }
.pal-work-badge.is-electric { --work-tone: #a16c12; }
.pal-work-badge.is-handcraft { --work-tone: #7861a8; }
.pal-work-badge.is-gathering { --work-tone: #9a6538; }
.pal-work-badge.is-lumbering { --work-tone: #557347; }
.pal-work-badge.is-mining { --work-tone: #596979; }
.pal-work-badge.is-medicine { --work-tone: #9a5b76; }
.pal-work-badge.is-cooling { --work-tone: #447c92; }
.pal-work-badge.is-transport { --work-tone: #98612f; }
.pal-work-badge.is-farming { --work-tone: #7d5a45; }
</style>
