<script setup lang="ts">
import { computed, useId, useSlots } from "vue";
import Dialog from "@/components/ui/dialog/Dialog.vue";
import DialogContent from "@/components/ui/dialog/DialogContent.vue";
import DialogDescription from "@/components/ui/dialog/DialogDescription.vue";
import DialogFooter from "@/components/ui/dialog/DialogFooter.vue";
import DialogHeader from "@/components/ui/dialog/DialogHeader.vue";
import DialogTitle from "@/components/ui/dialog/DialogTitle.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    size?: "sm" | "md" | "lg" | "xl";
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
  "max-w-md!": props.size === "sm",
  "max-w-lg!": props.size === "md",
  "max-w-3xl!": props.size === "lg",
  "max-w-5xl!": props.size === "xl",
}));

function close() {
  emit("close");
}

function handleOpenChange(value: boolean) {
  if (!value) close();
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="max-h-[calc(100vh-2rem)] overflow-y-auto shadow-float"
      :class="[sizeClass, { 'p-0': flush, 'z-1100': elevated }]"
      :show-close-button="!hideHeader"
      :role="role"
      @pointer-down-outside="!closeOnBackdrop && $event.preventDefault()"
    >
      <DialogHeader
        v-if="!hideHeader || slots.header"
        :class="{ 'sr-only': hideHeader }"
      >
        <DialogTitle v-if="slots.header" class="sr-only">
          {{ title }}
        </DialogTitle>
        <slot name="header" :title-id="titleId" :description-id="descriptionId">
          <DialogTitle :id="titleId">{{ title }}</DialogTitle>
          <DialogDescription v-if="description" :id="descriptionId">
            {{ description }}
          </DialogDescription>
        </slot>
      </DialogHeader>
      <DialogTitle v-else :id="titleId" class="sr-only">
        {{ title }}
      </DialogTitle>

      <slot />

      <DialogFooter v-if="slots.actions">
        <slot name="actions" />
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
