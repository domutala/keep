<script setup lang="ts">
import { computed, useId, useSlots } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    size?: "sm" | "md" | "lg";
    role?: "dialog" | "alertdialog";
    closeOnBackdrop?: boolean;
    elevated?: boolean;
    flush?: boolean;
    hideHeader?: boolean;
  }>(),
  {
    description: undefined,
    size: "md",
    role: "dialog",
    closeOnBackdrop: true,
    elevated: false,
    flush: false,
    hideHeader: false,
  },
);

const emit = defineEmits<{
  close: [];
}>();

const slots = useSlots();
const id = useId();
const titleId = `modal-title-${id}`;
const descriptionId = `modal-description-${id}`;

const sizeClass = computed(() => ({
  "max-w-sm": props.size === "sm",
  "max-w-md": props.size === "md",
  "max-w-2xl": props.size === "lg",
}));

function close() {
  emit("close");
}
</script>

<template>
  <div
    v-if="open"
    class="modal modal-open"
    :class="{ 'z-[1100]': elevated }"
    role="presentation"
    @keydown.esc="close"
  >
    <section
      class="modal-box relative max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-card border bg-base-100 shadow-float"
      :class="[sizeClass, { 'p-0': flush }]"
      :role="role"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="description || slots.header ? descriptionId : undefined"
    >
      <div v-if="!hideHeader || slots.header" :class="{ 'sr-only': hideHeader }">
        <slot name="header" :title-id="titleId" :description-id="descriptionId">
          <h2 :id="titleId" class="text-lg font-semibold">{{ title }}</h2>
          <p v-if="description" :id="descriptionId" class="mt-2 text-sm leading-6 text-base-content/70">
            {{ description }}
          </p>
        </slot>
      </div>
      <h2 v-else :id="titleId" class="sr-only">{{ title }}</h2>

      <slot />

      <div v-if="slots.actions" class="modal-action">
        <slot name="actions" />
      </div>
    </section>

    <button
      class="modal-backdrop"
      type="button"
      :aria-label="`Fermer : ${title}`"
      :disabled="!closeOnBackdrop"
      @click="closeOnBackdrop && close()"
    >
      Fermer
    </button>
  </div>
</template>
