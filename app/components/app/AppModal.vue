<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import { computed, useId, useSlots } from "vue";
import Dialog from "@/components/ui/dialog/Dialog.vue";
import DialogContent from "@/components/ui/dialog/DialogContent.vue";
import DialogDescription from "@/components/ui/dialog/DialogDescription.vue";
import DialogFooter from "@/components/ui/dialog/DialogFooter.vue";
import DialogHeader from "@/components/ui/dialog/DialogHeader.vue";
import DialogTitle from "@/components/ui/dialog/DialogTitle.vue";
import Drawer from "@/components/ui/drawer/Drawer.vue";
import DrawerContent from "@/components/ui/drawer/DrawerContent.vue";
import DrawerDescription from "@/components/ui/drawer/DrawerDescription.vue";
import DrawerFooter from "@/components/ui/drawer/DrawerFooter.vue";
import DrawerHeader from "@/components/ui/drawer/DrawerHeader.vue";
import DrawerTitle from "@/components/ui/drawer/DrawerTitle.vue";

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
const isSmallScreen = useMediaQuery("(max-width: 768px)");
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
  <Drawer
    v-if="isSmallScreen"
    :open="open"
    :dismissible="closeOnBackdrop"
    direction="down"
    @update:open="handleOpenChange"
  >
    <DrawerContent
      class="max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl shadow-float"
      :class="[{ 'z-1100': elevated }]"
      :role="role"
    >
      <button
        v-if="!hideHeader"
        class="absolute top-3 right-3 z-10 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
        aria-label="Fermer"
        @click="close"
      >
        <UIcon name="lucide:x" class="size-4" aria-hidden="true" />
      </button>

      <DrawerHeader
        v-if="!hideHeader || slots.header"
        class="pr-14 text-left"
        :class="{ 'sr-only': hideHeader }"
      >
        <DrawerTitle v-if="slots.header" class="sr-only">
          {{ title }}
        </DrawerTitle>
        <slot name="header" :title-id="titleId" :description-id="descriptionId">
          <DrawerTitle :id="titleId">{{ title }}</DrawerTitle>
          <DrawerDescription v-if="description" :id="descriptionId">
            {{ description }}
          </DrawerDescription>
        </slot>
      </DrawerHeader>
      <DrawerTitle v-else :id="titleId" class="sr-only">
        {{ title }}
      </DrawerTitle>

      <div :class="{ 'px-4 pb-4': !flush }">
        <slot />
      </div>

      <DrawerFooter v-if="slots.actions">
        <slot name="actions" />
      </DrawerFooter>
    </DrawerContent>
  </Drawer>

  <Dialog v-else :open="open" @update:open="handleOpenChange">
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
