<script setup lang="ts">
import { computed } from "vue";
import Button from "@/components/ui/button/Button.vue";
import type { Folder, Note } from "../../stores/notes";

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
  <aside class="w-full bg-background p-3 lg:self-start">
    <div class="flex items-center justify-between px-2 mb-1">
      <h2 class="text-xs text-muted">Dossiers</h2>
      <Button
        variant="ghost"
        size="icon-sm"
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
      </Button>
    </div>

    <ul class="flex w-full flex-col gap-1 p-0 text-sm">
      <li v-for="folder in folderRows" :key="folder.id">
        <div
          class="group/folder flex rounded-md"
          :class="{
            'bg-accent text-accent-foreground': modelValue === folder.id,
            'hover:bg-muted': modelValue !== folder.id,
          }"
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
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-7 opacity-0 focus:opacity-100 group-hover/folder:opacity-100"
            type="button"
            :aria-label="`Renommer le dossier ${folder.name}`"
            title="Renommer"
            @click.stop="emit('rename', folder)"
          >
            <UIcon name="lucide:pencil" class="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-7 opacity-0 focus:opacity-100 group-hover/folder:opacity-100"
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
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-7 text-destructive opacity-0 focus:opacity-100 group-hover/folder:opacity-100"
            type="button"
            :aria-label="`Supprimer le dossier ${folder.name}`"
            title="Supprimer"
            @click.stop="emit('delete', folder)"
          >
            <UIcon name="lucide:trash-2" class="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </li>

      <div v-if="unfiledNotes.length" class="mt-5 px-3">
        <div class="text-xs text-muted">Notes</div>
      </div>
      <li v-for="note in unfiledNotes" :key="note.id">
        <button
          class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-foreground/70 hover:bg-muted"
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
