<script setup lang="ts">
import { computed } from "vue";
import type { Folder, Note } from "../stores/notes";

interface FolderRow extends Folder {
  depth: number;
}

const props = defineProps<{
  folders: Folder[];
  notes: Note[];
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  create: [parentId: string | null];
  rename: [folder: Folder];
  delete: [folder: Folder];
  openNote: [note: Note];
}>();

const folderRows = computed(() => {
  const rows: FolderRow[] = [];
  const visited = new Set<string>();

  function appendChildren(parentId: string | null, depth: number) {
    props.folders
      .filter((folder) => folder.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .forEach((folder) => {
        if (visited.has(folder.id)) return;
        visited.add(folder.id);
        rows.push({ ...folder, depth });
        appendChildren(folder.id, depth + 1);
      });
  }

  appendChildren(null, 0);
  return rows;
});

const unfiledNotes = computed(() =>
  props.notes
    .filter((note) => !note.folderId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
);
</script>

<template>
  <aside class="bg-base-100 p-3 lg:self-start w-full">
    <div class="flex items-center justify-between px-2 mb-1">
      <h2 class="text-xs text-muted">Dossiers</h2>
      <button
        class="btn btn-circle btn-ghost btn-xs"
        type="button"
        aria-label="Créer un dossier"
        title="Créer un dossier"
        @click="emit('create', null)"
      >
        <UIcon
          name="lucide:plus"
          class="size-3.5 shrink-0"
          aria-hidden="true"
        />
      </button>
    </div>

    <ul class="menu w-full gap-1 p-0 text-sm">
      <!-- <li>
        <button
          :class="{ 'menu-active': modelValue === 'all' }"
          type="button"
          @click="emit('update:modelValue', 'all')"
        >
          <Icon :icon="fileTextIcon" class="size-4" aria-hidden="true" />
          Toutes les notes
        </button>
      </li> -->

      <li v-for="folder in folderRows" :key="folder.id">
        <div
          class="group/folder flex rounded-md"
          :class="{ 'menu-active': modelValue === folder.id }"
          :style="{ paddingLeft: `${0.75 + folder.depth * 1.1}rem` }"
          role="button"
          tabindex="0"
          @click="emit('update:modelValue', folder.id)"
          @keydown.enter="emit('update:modelValue', folder.id)"
        >
          <UIcon
            name="lucide:folder-closed"
            class="size-3.5 shrink-0"
            aria-hidden="true"
          />

          <span class="min-w-0 flex-1 truncate">{{ folder.name }}</span>
          <button
            class="btn btn-circle btn-ghost btn-xs opacity-0 focus:opacity-100 group-hover/folder:opacity-100"
            type="button"
            :aria-label="`Renommer le dossier ${folder.name}`"
            title="Renommer"
            @click.stop="emit('rename', folder)"
          >
            <UIcon name="lucide:pencil" class="size-3.5" aria-hidden="true" />
          </button>
          <button
            class="btn btn-circle btn-ghost btn-xs opacity-0 focus:opacity-100 group-hover/folder:opacity-100"
            type="button"
            :aria-label="`Créer un sous-dossier dans ${folder.name}`"
            title="Ajouter un sous-dossier"
            @click.stop="emit('create', folder.id)"
          >
            <UIcon
              name="lucide:folder-plus"
              class="size-3.5"
              aria-hidden="true"
            />
          </button>
          <button
            class="btn btn-circle btn-ghost btn-xs text-error opacity-0 focus:opacity-100 group-hover/folder:opacity-100"
            type="button"
            :aria-label="`Supprimer le dossier ${folder.name}`"
            title="Supprimer"
            @click.stop="emit('delete', folder)"
          >
            <UIcon name="lucide:trash-2" class="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </li>

      <div v-if="unfiledNotes.length" class="mt-5 px-3">
        <div class="text-xs text-muted">Notes</div>
      </div>
      <li v-for="note in unfiledNotes" :key="note.id">
        <button
          class="text-base-content/70 rounded"
          type="button"
          :title="note.title || 'Note sans titre'"
          @click="emit('openNote', note)"
        >
          <UIcon
            name="lucide:file-text"
            class="size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span class="truncate">
            {{
              note.title ||
              (note.format === "rich-text" ? note.contentText : note.content) ||
              "Note sans titre"
            }}
          </span>
        </button>
      </li>
    </ul>
  </aside>
</template>
