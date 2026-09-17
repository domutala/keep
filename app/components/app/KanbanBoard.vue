<script setup lang="ts">
import { ref, watch } from "vue";
import Draggable from "vuedraggable";
import type { Category, Folder, Note } from "../../stores/notes";
import type { ContentItem } from "../../types";
import FolderCard from "./FolderCard.vue";
import NoteCard from "./NoteCard.vue";

interface KanbanColumn {
  id: string;
  categoryId: string | null;
  name: string;
  color: string;
  items: ContentItem[];
}

const props = defineProps<{
  items: ContentItem[];
  categories: Category[];
}>();

const emit = defineEmits<{
  openFolder: [folder: Folder];
  renameFolder: [folder: Folder];
  deleteFolder: [folder: Folder];
  openNote: [note: Note];
  deleteNote: [note: Note];
  move: [
    payload: {
      categoryId: string | null;
      items: Array<{ type: "folder" | "note"; id: string }>;
    },
  ];
}>();

const columns = ref<KanbanColumn[]>([]);

function itemCategoryId(item: ContentItem) {
  return item.type === "note"
    ? (item.note.categoryId ?? null)
    : (item.folder.categoryId ?? null);
}

function itemOrder(item: ContentItem) {
  const order =
    item.type === "note" ? item.note.kanbanOrder : item.folder.kanbanOrder;
  return order ?? Number.MAX_SAFE_INTEGER;
}

function rebuildColumns() {
  const visibleCategoryIds = new Set(
    props.categories.map((category) => category.id),
  );
  const definitions = [
    {
      id: "uncategorized",
      categoryId: null,
      name: "Sans catégorie",
      color: "#94a3b8",
    },
    ...props.categories.map((category) => ({
      id: category.id,
      categoryId: category.id,
      name: category.name,
      color: category.color,
    })),
  ];

  columns.value = definitions.map((column) => ({
    ...column,
    items: props.items
      .filter((item) => {
        const categoryId = itemCategoryId(item);
        const visibleCategoryId =
          categoryId && visibleCategoryIds.has(categoryId) ? categoryId : null;
        return visibleCategoryId === column.categoryId;
      })
      .sort(
        (a, b) => itemOrder(a) - itemOrder(b) || b.date.localeCompare(a.date),
      ),
  }));
}

function itemKey(item: ContentItem) {
  return item.type === "note"
    ? `note:${item.note.id}`
    : `folder:${item.folder.id}`;
}

function emitColumn(column: KanbanColumn) {
  emit("move", {
    categoryId: column.categoryId,
    items: column.items.map((item) =>
      item.type === "note"
        ? { type: "note" as const, id: item.note.id }
        : { type: "folder" as const, id: item.folder.id },
    ),
  });
}

watch(() => [props.items, props.categories], rebuildColumns, {
  deep: true,
  immediate: true,
});
</script>

<template>
  <div
    class="kanban-board h-[calc(100dvh-6rem)] max-h-[calc(100dvh-6rem)] overflow-x-auto overflow-y-hidden pb-5"
  >
    <div class="flex h-full min-w-max items-stretch gap-4">
      <section
        v-for="column in columns"
        :key="column.id"
        class="flex max-h-full w-95 shrink-0 flex-col rounded-xl border bg-muted/10"
        :aria-labelledby="`kanban-${column.id}`"
      >
        <header class="mb-3 flex items-center gap-2 px-3 pt-2">
          <span
            class="size-2.5 rounded-full"
            :style="{ backgroundColor: column.color }"
            aria-hidden="true"
          />
          <h3
            :id="`kanban-${column.id}`"
            class="min-w-0 flex-1 truncate text-sm font-semibold"
          >
            {{ column.name }}
          </h3>
          <span
            class="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground"
          >
            {{ column.items.length }}
          </span>
        </header>

        <Draggable
          :list="column.items"
          :item-key="itemKey"
          group="keep-kanban"
          handle=".kanban-drag-handle"
          ghost-class="opacity-40"
          drag-class="rotate-1"
          class="kanban-column-scroll min-h-28 flex-1 space-y-3 overflow-y-scroll overscroll-contain rounded-lg px-1 pl-2 py-3"
          @change="emitColumn(column)"
        >
          <template #item="{ element: item }">
            <div class="group relative">
              <FolderCard
                v-if="item.type === 'folder'"
                :folder="item.folder"
                :latest-note="item.latestNote"
                :summary="item.summary"
                @open="emit('openFolder', $event)"
                @rename="emit('renameFolder', $event)"
                @delete="emit('deleteFolder', $event)"
              >
                <template #menu-after>
                  <UButton
                    aria-label="Déplacer"
                    variant="outline"
                    size="icon-sm"
                    class="kanban-drag-handle"
                  >
                    <UIcon name="lucide:grip-vertical" class="size-4" />
                  </UButton>
                </template>
              </FolderCard>
              <NoteCard
                v-else
                :note="item.note"
                @open="emit('openNote', $event)"
                @delete="emit('deleteNote', $event)"
              >
                <template #menu-after>
                  <UButton
                    aria-label="Déplacer"
                    variant="outline"
                    size="icon-sm"
                    class="kanban-drag-handle"
                  >
                    <UIcon name="lucide:grip-vertical" class="size-4" />
                  </UButton>
                </template>
              </NoteCard>
            </div>
          </template>
        </Draggable>
      </section>
    </div>
  </div>
</template>

<style scoped>
.kanban-board,
.kanban-column-scroll {
  scrollbar-color: transparent transparent;
  scrollbar-width: thin;
}

.kanban-board:hover,
.kanban-board:hover .kanban-column-scroll {
  scrollbar-color: color-mix(in srgb, var(--muted-foreground) 55%, transparent)
    transparent;
}

.kanban-board::-webkit-scrollbar,
.kanban-column-scroll::-webkit-scrollbar {
  width: 0.5rem;
  height: 0.5rem;
}

.kanban-board::-webkit-scrollbar-track,
.kanban-column-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.kanban-board::-webkit-scrollbar-thumb,
.kanban-column-scroll::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: transparent;
}

.kanban-board:hover::-webkit-scrollbar-thumb,
.kanban-board:hover .kanban-column-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--muted-foreground) 55%, transparent);
}
</style>
