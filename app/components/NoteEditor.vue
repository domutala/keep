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
import { watch } from "vue";
import type { Folder } from "../stores/notes";

const props = defineProps<{
  modelValue: string;
  folders?: {
    id: string;
    label: string;
  }[];
}>();

const selectedFolder = defineModel<string | null>("selectedFolder", {
  default: null,
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

    <div
      v-if="editor"
      class="flex flex-wrap items-center gap-1 border-t bg-canvas/65 px-3 py-2"
      role="toolbar"
      aria-label="Mise en forme"
    >
      <button
        class="editor-tool btn btn-ghost btn-sm"
        :class="{
          'editor-tool-active': editor.isActive('heading', { level: 2 }),
        }"
        type="button"
        aria-label="Titre"
        title="Titre"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        <Icon :icon="headingIcon" class="size-4" />
      </button>
      <button
        class="editor-tool btn btn-ghost btn-sm"
        :class="{ 'editor-tool-active': editor.isActive('bold') }"
        type="button"
        aria-label="Gras"
        title="Gras"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <Icon :icon="boldIcon" class="size-4" />
      </button>
      <button
        class="editor-tool btn btn-ghost btn-sm"
        :class="{ 'editor-tool-active': editor.isActive('italic') }"
        type="button"
        aria-label="Italique"
        title="Italique"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <Icon :icon="italicIcon" class="size-4" />
      </button>
      <span class="mx-1 h-5 w-px bg-line" />
      <button
        class="editor-tool btn btn-ghost btn-sm"
        :class="{ 'editor-tool-active': editor.isActive('bulletList') }"
        type="button"
        aria-label="Liste à puces"
        title="Liste à puces"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        <Icon :icon="listIcon" class="size-4" />
      </button>
      <button
        class="editor-tool btn btn-ghost btn-sm"
        :class="{ 'editor-tool-active': editor.isActive('orderedList') }"
        type="button"
        aria-label="Liste numérotée"
        title="Liste numérotée"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        <Icon :icon="orderedListIcon" class="size-4" />
      </button>
      <button
        class="editor-tool btn btn-ghost btn-sm"
        :class="{ 'editor-tool-active': editor.isActive('taskList') }"
        type="button"
        aria-label="Liste de tâches"
        title="Liste de tâches"
        @click="editor.chain().focus().toggleTaskList().run()"
      >
        <Icon :icon="checklistIcon" class="size-4" />
      </button>
      <span class="mx-1 h-5 w-px bg-line" />
      <button
        class="editor-tool btn btn-ghost btn-sm"
        type="button"
        :disabled="!editor.can().undo()"
        aria-label="Annuler"
        title="Annuler"
        @click="editor.chain().focus().undo().run()"
      >
        <Icon :icon="undoIcon" class="size-4" />
      </button>
      <button
        class="editor-tool btn btn-ghost btn-sm"
        type="button"
        :disabled="!editor.can().redo()"
        aria-label="Rétablir"
        title="Rétablir"
        @click="editor.chain().focus().redo().run()"
      >
        <Icon :icon="redoIcon" class="size-4" />
      </button>

      <div class="mx-auto"></div>

      <div class="flex items-center">
        <UIcon name="lucide:folder-closed" />
        <select
          v-model="selectedFolder"
          class="select select-ghost outline-none"
          id="edit-note-folder"
        >
          <option :value="null" selected>Sans dossier</option>
          <option
            v-for="folder in folders ?? []"
            :key="folder.id"
            :value="folder.id"
          >
            {{ folder.label }}
          </option>
        </select>
      </div>

      <button
        class="btn btn-ghost btn-sm rounded-full text-sm font-medium text-ink hover:bg-canvas"
        type="button"
        @click="emit('close')"
      >
        Fermer
      </button>
    </div>
  </div>
</template>
