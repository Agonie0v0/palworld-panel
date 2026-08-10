<script setup>
import { computed, inject } from "vue";

const props = defineProps({
  show: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  title: { type: String, default: "" },
  width: { type: String, default: "min(94vw, 1180px)" },
  inheritWorkspaceTitle: { type: Boolean, default: true },
});

defineEmits(["update:show"]);
const workspaceTitle = inject("workspace-title", null);
const resolvedTitle = computed(() =>
  props.embedded && props.inheritWorkspaceTitle && workspaceTitle?.value
    ? workspaceTitle.value
    : props.title,
);

</script>

<template>
  <section
    v-if="embedded"
    class="tool-surface"
    :style="{ width: '100%', maxWidth: 'none' }"
    :aria-label="resolvedTitle"
  >
    <header class="tool-surface__header">
      <div class="tool-surface__heading">
        <h2>{{ resolvedTitle }}</h2>
        <div v-if="$slots.description" class="tool-surface__description">
          <slot name="description" />
        </div>
      </div>
      <div v-if="$slots['header-extra']" class="tool-surface__actions">
        <slot name="header-extra" />
      </div>
    </header>
    <div class="tool-surface__body">
      <slot />
    </div>
  </section>

  <n-modal
    v-else
    :show="props.show"
    preset="card"
    :title="resolvedTitle"
    :style="{ width }"
    :mask-closable="false"
    closable
    @update:show="emit('update:show', $event)"
  >
    <template v-if="$slots['header-extra']" #header-extra>
      <slot name="header-extra" />
    </template>
    <slot />
  </n-modal>
</template>

<style scoped>
.tool-surface {
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 24px;
  color: var(--app-ink);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-card-radius);
  box-shadow: var(--app-shadow-sm);
}

.tool-surface__header {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 0 24px;
}

.tool-surface__heading {
  min-width: 0;
}

.tool-surface__heading h2 {
  overflow: hidden;
  color: var(--app-ink);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-surface__description {
  max-width: 70ch;
  margin-top: 6px;
  color: var(--app-ink-muted);
  font-size: 12px;
}

.tool-surface__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.tool-surface__body {
  min-width: 0;
  padding: 0;
}

@media (min-width: 1600px) and (min-height: 900px) {
  .tool-surface__header {
    min-height: 72px;
    padding: 0 0 32px;
  }

  .tool-surface__heading h2 {
    font-size: 26px;
  }

  .tool-surface__body { padding: 0; }
}

@media (max-width: 700px) {
  .tool-surface { padding: 16px; }

  .tool-surface__header,
  .tool-surface__body {
    padding-inline: 0;
  }

  .tool-surface__header { padding-bottom: 20px; }

  .tool-surface__heading h2 { font-size: 20px; }
}
</style>
