<script setup lang="ts">
import boldIcon from "@iconify-icons/lucide/bold";
import headingIcon from "@iconify-icons/lucide/heading-2";
import italicIcon from "@iconify-icons/lucide/italic";
import checklistIcon from "@iconify-icons/lucide/list-checks";
import listIcon from "@iconify-icons/lucide/list";
import orderedListIcon from "@iconify-icons/lucide/list-ordered";
import redoIcon from "@iconify-icons/lucide/redo-2";
import undoIcon from "@iconify-icons/lucide/undo-2";
import { Icon } from "@iconify/vue";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { computed, watch } from "vue";
import Button from "@/components/ui/button/Button.vue";
import type { Folder } from "../../stores/notes";

const props = defineProps<{
  modelValue: string;
  folders?: {
    id: string;
    label: string;
  }[];
  categories?: {
    id: string;
    label: string;
    color: string;
  }[];
}>();

const selectedFolder = defineModel<string | null>("selectedFolder", {
  default: null,
});
const selectedFolderValue = computed({
  get: () => selectedFolder.value ?? "__none__",
  set: (value: string) => {
    selectedFolder.value = value === "__none__" ? null : value;
  },
});
const selectedCategory = defineModel<string | null>("selectedCategory", {
  default: null,
});
const selectedCategoryValue = computed({
  get: () => selectedCategory.value ?? "__none__",
  set: (value: string) => {
    selectedCategory.value = value === "__none__" ? null : value;
  },
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:text": [value: string];
  close: [];
}>();

const editor = useEditor({
  content: props.modelValue,
  extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true })],
  // immediatelyRender: false,
  editorProps: {
    attributes: {
      class: "tiptap",
      "aria-label": "Contenu de la note",
      "data-placeholder": "Écrivez votre note…",
    },
  },
  onUpdate: ({ editor }) => {
    emit("update:modelValue", editor.getHTML());
    emit("update:text", editor.getText());
  },
});

watch(
  () => props.modelValue,
  (value) => {
    if (editor.value && editor.value.getHTML() !== value) {
      editor.value.commands.setContent(value, { emitUpdate: false });
    }
  },
);

function focus() {
  editor.value?.commands.focus();
}

defineExpose({ focus });
</script>

<template>
  <div class="border-y">
    <EditorContent :editor="editor" />

    <template v-if="editor">
      <div
        class="flex flex-wrap items-center gap-1 border-t bg-canvas/65 px-3 py-2"
        role="toolbar"
        aria-label="Mise en forme"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          class="editor-tool"
          :class="{
            'editor-tool-active': editor.isActive('heading', { level: 2 }),
          }"
          type="button"
          aria-label="Titre"
          title="Titre"
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        >
          <Icon :icon="headingIcon" class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="editor-tool"
          :class="{ 'editor-tool-active': editor.isActive('bold') }"
          type="button"
          aria-label="Gras"
          title="Gras"
          @click="editor.chain().focus().toggleBold().run()"
        >
          <Icon :icon="boldIcon" class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="editor-tool"
          :class="{ 'editor-tool-active': editor.isActive('italic') }"
          type="button"
          aria-label="Italique"
          title="Italique"
          @click="editor.chain().focus().toggleItalic().run()"
        >
          <Icon :icon="italicIcon" class="size-4" />
        </Button>
        <span class="mx-1 h-5 w-px bg-line" />
        <Button
          variant="ghost"
          size="icon-sm"
          class="editor-tool"
          :class="{ 'editor-tool-active': editor.isActive('bulletList') }"
          type="button"
          aria-label="Liste à puces"
          title="Liste à puces"
          @click="editor.chain().focus().toggleBulletList().run()"
        >
          <Icon :icon="listIcon" class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="editor-tool"
          :class="{ 'editor-tool-active': editor.isActive('orderedList') }"
          type="button"
          aria-label="Liste numérotée"
          title="Liste numérotée"
          @click="editor.chain().focus().toggleOrderedList().run()"
        >
          <Icon :icon="orderedListIcon" class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="editor-tool"
          :class="{ 'editor-tool-active': editor.isActive('taskList') }"
          type="button"
          aria-label="Liste de tâches"
          title="Liste de tâches"
          @click="editor.chain().focus().toggleTaskList().run()"
        >
          <Icon :icon="checklistIcon" class="size-4" />
        </Button>
        <span class="mx-1 h-5 w-px bg-line" />
        <Button
          variant="ghost"
          size="icon-sm"
          class="editor-tool"
          type="button"
          :disabled="!editor.can().undo()"
          aria-label="Annuler"
          title="Annuler"
          @click="editor.chain().focus().undo().run()"
        >
          <Icon :icon="undoIcon" class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          class="editor-tool"
          type="button"
          :disabled="!editor.can().redo()"
          aria-label="Rétablir"
          title="Rétablir"
          @click="editor.chain().focus().redo().run()"
        >
          <Icon :icon="redoIcon" class="size-4" />
        </Button>
      </div>
      <div
        class="flex flex-wrap items-center gap-1 border-t bg-canvas/65 px-3 py-2"
        role="toolbar"
        aria-label="Mise en forme"
      >
        <USelect v-model="selectedCategoryValue">
          <USelectTrigger class="max-w-45 border-0">
            <USelectValue>
              <span
                v-if="selectedCategory"
                class="size-2.5 shrink-0 rounded-full"
                :style="{
                  backgroundColor: categories?.find(
                    (c) => c.id === selectedCategory,
                  )?.color,
                }"
                aria-hidden="true"
              />
              <UIcon v-else name="lucide:tag" />
              <template v-if="selectedCategory">
                {{ categories?.find((c) => c.id === selectedCategory)?.label }}
              </template>
              <template v-else> Sans catégorie </template>
            </USelectValue>
          </USelectTrigger>
          <USelectContent>
            <USelectGroup>
              <USelectItem value="__none__">Sans catégorie</USelectItem>
              <USelectItem
                v-for="category in categories ?? []"
                :key="category.id"
                :value="category.id"
              >
                <span
                  class="mr-1.5 inline-block size-2.5 rounded-full align-middle"
                  :style="{ backgroundColor: category.color }"
                  aria-hidden="true"
                />
                {{ category.label }}
              </USelectItem>
            </USelectGroup>
          </USelectContent>
        </USelect>

        <USelect v-model="selectedFolderValue">
          <USelectTrigger class="max-w-45 border-0">
            <USelectValue>
              <UIcon name="lucide:folder-closed" />
              <template v-if="selectedFolder">
                {{ folders?.find((f) => f.id === selectedFolder)?.label }}
              </template>
              <template v-else> Selectionnez un dossier </template>
            </USelectValue>
          </USelectTrigger>
          <USelectContent>
            <USelectGroup>
              <USelectItem value="__none__">Sans dossier</USelectItem>
              <USelectItem
                v-for="folder in folders ?? []"
                :key="folder.id"
                :value="folder.id"
              >
                {{ folder.label }}
              </USelectItem>
            </USelectGroup>
          </USelectContent>
        </USelect>

        <div class="mx-auto"></div>
        <Button
          variant="ghost"
          size="sm"
          class="rounded-full text-ink hover:bg-canvas"
          type="button"
          @click="emit('close')"
        >
          Fermer
        </Button>
      </div>
    </template>
  </div>
</template>
