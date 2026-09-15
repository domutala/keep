<script setup lang="ts">
import fileTextIcon from "@iconify-icons/lucide/file-text";
import plusIcon from "@iconify-icons/lucide/plus";
import searchIcon from "@iconify-icons/lucide/search";
import trashIcon from "@iconify-icons/lucide/trash-2";
import { Icon } from "@iconify/vue";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import AppModal from "../components/AppModal.vue";
import FolderCard from "../components/FolderCard.vue";
import FolderSidebar from "../components/FolderSidebar.vue";
import NoteCard from "../components/NoteCard.vue";
import NoteEditor from "../components/NoteEditor.vue";
import { useNotesStore, type Folder, type Note } from "../stores/notes";

const notesStore = useNotesStore();
const route = useRoute();
const router = useRouter();

const isComposerOpen = ref(false);
const title = ref("");
const contentHtml = ref("");
const contentText = ref("");
const search = ref("");
const selectedFolder = computed({
  get() {
    if (route.path === "/unfiled") return "unfiled";

    const folderId = route.params.folderId;
    return typeof folderId === "string" ? folderId : "all";
  },
  set(folderId: string) {
    if (folderId === "all") {
      void router.push("/");
      return;
    }
    if (folderId === "unfiled") {
      void router.push("/unfiled");
      return;
    }

    void router.push(`/folders/${encodeURIComponent(folderId)}`);
  },
});
const noteFolderId = ref<string | null>(null);
const noteEditor = ref<InstanceType<typeof NoteEditor> | null>(null);
const currentNoteId = ref<string>();
const isEditingExistingNote = ref(false);
const notePendingDeletion = ref<Note | null>(null);
const isFolderModalOpen = ref(false);
const folderBeingRenamed = ref<Folder | null>(null);
const folderPendingDeletion = ref<Folder | null>(null);
const newFolderName = ref("");
const newFolderParentId = ref<string | null>(null);
const saveState = ref<"idle" | "saving" | "saved">("idle");
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const filteredNotes = computed(() => {
  const query = search.value.trim().toLocaleLowerCase("fr");
  const notes = notesStore.notes.filter((note) => {
    if (selectedFolder.value === "all") return true;
    if (selectedFolder.value === "unfiled") return !note.folderId;
    return note.folderId === selectedFolder.value;
  });

  if (!query) return notes;

  return notes.filter((note) => {
    const content =
      note.format === "rich-text" ? note.contentText : note.content;
    return `${note.title} ${content}`.toLocaleLowerCase("fr").includes(query);
  });
});

const displayedFolders = computed(() => {
  if (selectedFolder.value === "unfiled") return [];

  const parentId = selectedFolder.value === "all" ? null : selectedFolder.value;
  const query = search.value.trim().toLocaleLowerCase("fr");

  return notesStore.folders
    .filter((folder) => folder.parentId === parentId)
    .filter(
      (folder) => !query || folder.name.toLocaleLowerCase("fr").includes(query),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
});

type ContentItem =
  | { type: "folder"; folder: Folder; latestNote?: Note; date: string }
  | { type: "note"; note: Note; date: string };

function descendantFolderIds(folderId: string) {
  const ids = new Set([folderId]);
  let foundChild = true;

  while (foundChild) {
    foundChild = false;
    for (const folder of notesStore.folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        foundChild = true;
      }
    }
  }

  return ids;
}

function latestNoteInFolder(folderId: string) {
  const folderIds = descendantFolderIds(folderId);
  return notesStore.notes
    .filter((note) => note.folderId && folderIds.has(note.folderId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

const contentItems = computed<ContentItem[]>(() => {
  const folders: ContentItem[] = displayedFolders.value.map((folder) => {
    const latestNote = latestNoteInFolder(folder.id);
    return {
      type: "folder",
      folder,
      latestNote,
      date: latestNote?.createdAt ?? folder.createdAt,
    };
  });
  const notes: ContentItem[] = filteredNotes.value.map((note) => ({
    type: "note",
    note,
    date: note.createdAt,
  }));

  return [...folders, ...notes].sort((a, b) => b.date.localeCompare(a.date));
});

function folderSummary(folderId: string) {
  const childCount = notesStore.folders.filter(
    (folder) => folder.parentId === folderId,
  ).length;
  const noteCount = notesStore.notes.filter(
    (note) => note.folderId === folderId,
  ).length;

  return [
    `${noteCount} ${noteCount > 1 ? "notes" : "note"}`,
    `${childCount} ${childCount > 1 ? "sous-dossiers" : "sous-dossier"}`,
  ].join(" · ");
}

async function openComposer() {
  currentNoteId.value = undefined;
  isEditingExistingNote.value = false;
  noteFolderId.value =
    selectedFolder.value === "all" || selectedFolder.value === "unfiled"
      ? null
      : selectedFolder.value;
  saveState.value = "idle";
  isComposerOpen.value = true;
  await nextTick();
  noteEditor.value?.focus();
}

function closeComposer() {
  saveDraft();
  isComposerOpen.value = false;
  title.value = "";
  contentHtml.value = "";
  contentText.value = "";
  noteFolderId.value = null;
  currentNoteId.value = undefined;
  isEditingExistingNote.value = false;
  saveState.value = "idle";
}

async function editNote(note: Note) {
  if (isComposerOpen.value) saveDraft();

  currentNoteId.value = note.id;
  isEditingExistingNote.value = true;
  title.value = note.title;
  contentText.value =
    note.format === "rich-text" ? note.contentText : note.content;
  noteFolderId.value = note.folderId ?? null;
  contentHtml.value =
    note.format === "rich-text"
      ? note.contentHtml
      : `<p>${escapeHtml(note.content).replaceAll("\n", "<br>")}</p>`;
  saveState.value = "saved";
  isComposerOpen.value = true;

  await nextTick();
  noteEditor.value?.focus();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function requestNoteDeletion(note: Note) {
  notePendingDeletion.value = note;
}

function cancelNoteDeletion() {
  notePendingDeletion.value = null;
}

function confirmNoteDeletion() {
  const note = notePendingDeletion.value;
  if (!note) return;

  notesStore.deleteNote(note.id);
  notePendingDeletion.value = null;

  if (currentNoteId.value === note.id) {
    if (saveTimer) clearTimeout(saveTimer);
    isComposerOpen.value = false;
    title.value = "";
    contentHtml.value = "";
    contentText.value = "";
    noteFolderId.value = null;
    currentNoteId.value = undefined;
    isEditingExistingNote.value = false;
    saveState.value = "idle";
  }
}

function requestCurrentNoteDeletion() {
  const note = notesStore.notes.find((item) => item.id === currentNoteId.value);
  if (note) requestNoteDeletion(note);
}

function openFolderModal(parentId: string | null) {
  folderBeingRenamed.value = null;
  newFolderParentId.value = parentId;
  newFolderName.value = "";
  isFolderModalOpen.value = true;
}

function openRenameFolderModal(folder: Folder) {
  folderBeingRenamed.value = folder;
  newFolderParentId.value = folder.parentId;
  newFolderName.value = folder.name;
  isFolderModalOpen.value = true;
}

function closeFolderModal() {
  isFolderModalOpen.value = false;
  newFolderName.value = "";
  newFolderParentId.value = null;
  folderBeingRenamed.value = null;
}

function createFolder() {
  if (folderBeingRenamed.value) {
    if (
      notesStore.renameFolder(folderBeingRenamed.value.id, newFolderName.value)
    ) {
      closeFolderModal();
    }
    return;
  }

  const id = notesStore.addFolder(newFolderName.value, newFolderParentId.value);
  if (!id) return;

  selectedFolder.value = id;
  closeFolderModal();
}

function requestFolderDeletion(folder: Folder) {
  folderPendingDeletion.value = folder;
}

function cancelFolderDeletion() {
  folderPendingDeletion.value = null;
}

function confirmFolderDeletion() {
  const folder = folderPendingDeletion.value;
  if (!folder) return;

  const deletedFolderIds = notesStore.deleteFolder(folder.id);

  if (deletedFolderIds.includes(selectedFolder.value)) {
    selectedFolder.value = "all";
  }
  if (noteFolderId.value && deletedFolderIds.includes(noteFolderId.value)) {
    noteFolderId.value = null;
  }

  folderPendingDeletion.value = null;
}

const newFolderParentName = computed(
  () =>
    notesStore.folders.find((folder) => folder.id === newFolderParentId.value)
      ?.name,
);

const folderOptions = computed(() => {
  const options: Array<{ id: string; label: string }> = [];
  const visited = new Set<string>();

  function append(parentId: string | null, ancestors: string[]) {
    notesStore.folders
      .filter((folder) => folder.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .forEach((folder) => {
        if (visited.has(folder.id)) return;
        visited.add(folder.id);
        options.push({
          id: folder.id,
          label: [...ancestors, folder.name].join(" / "),
        });
        append(folder.id, [...ancestors, folder.name]);
      });
  }

  append(null, []);
  return options;
});

function saveDraft() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }

  if (!title.value.trim() && !contentText.value.trim()) {
    saveState.value = "idle";
    return;
  }

  currentNoteId.value = notesStore.saveNote(
    {
      title: title.value,
      contentHtml: contentHtml.value,
      contentText: contentText.value,
      folderId: noteFolderId.value,
    },
    currentNoteId.value,
  );
  saveState.value = "saved";
}

watch([title, contentHtml, contentText, noteFolderId], () => {
  if (!isComposerOpen.value) return;

  saveState.value = "saving";
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 500);
});

onBeforeUnmount(saveDraft);
</script>

<template>
  <nav class="navbar sticky top-0 z-10 w-full bg-base-100/10 backdrop-blur-xl">
    <label
      for="my-drawer-4"
      aria-label="open sidebar"
      class="btn btn-square btn-ghost drawer-button lg:hidden"
    >
      <u-icon name="lucide:panel-left" class="inline-block size-4" />
    </label>

    <div
      @click="selectedFolder = 'all'"
      class="btn btn-ghost border-0 pl-3 mr-auto"
    >
      <u-icon name="lucide:lightbulb" class="size-5" />

      <span class="font-semibold text-xl">Keep</span>
    </div>

    <label
      class="relative hidden w-full max-w-md sm:block bg-surface border-transparent focus-within:border-brand-400 border rounded-lg"
    >
      <span class="sr-only">Rechercher dans les notes</span>
      <Icon
        :icon="searchIcon"
        class="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-"
        aria-hidden="true"
      />
      <input
        v-model="search"
        class="input h-11 w-full bg-transparent pr-4 pl-11 text-sm outline-none placeholder:text-muted/75 border-transparent"
        placeholder="Rechercher une note…"
        type="search"
      />
    </label>
  </nav>

  <main class="mx-auto max-w-[1580px] px-4 py-10 sm:px-6 sm:py-14">
    <section class="mx-auto max-w-2xl">
      <p class="mb-2 text-sm font-medium text-brand-700">Bonjour 👋</p>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
        Qu’avez-vous en tête ?
      </h1>
      <p class="mt-3 text-muted">
        Capturez une idée, une tâche ou quelque chose à ne pas oublier.
      </p>

      <form
        v-if="isComposerOpen && !isEditingExistingNote"
        class="mt-8 overflow-hidden rounded-card border bg-surface shadow-float"
        @submit.prevent
      >
        <label class="sr-only" for="note-title">Titre de la note</label>
        <input
          id="note-title"
          v-model="title"
          class="input h-auto w-full rounded-none border-0 bg-transparent px-5 py-4 text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted/70 focus:outline-none"
          maxlength="120"
          :placeholder="
            isEditingExistingNote ? 'Titre de la note' : 'Titre (facultatif)'
          "
          type="text"
        />

        <NoteEditor
          ref="noteEditor"
          v-model="contentHtml"
          v-model:selected-folder="noteFolderId"
          :folders="folderOptions"
          @update:text="contentText = $event"
          @close="closeComposer"
        />

        <!-- <div class="flex items-center justify-between px-4 py-3">
            <span class="text-xs text-muted" aria-live="polite">
              {{
                saveState === "saving"
                  ? "Enregistrement…"
                  : saveState === "saved"
                    ? "Enregistré"
                    : "Sauvegarde automatique"
              }}
            </span>
            <button
              class="rounded-full px-4 py-2 text-sm font-medium text-ink transition hover:bg-canvas"
              type="button"
              @click="closeComposer"
            >
              Fermer
            </button>
          </div> -->
      </form>

      <button
        v-else-if="!isEditingExistingNote"
        class="btn h-auto min-h-16 w-full justify-start gap-4 mt-4 rounded-card border bg-surface px-3 text-left font-normal shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float"
        type="button"
        @click="openComposer"
      >
        <span
          class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700"
        >
          <Icon :icon="plusIcon" class="size-4" aria-hidden="true" />
        </span>
        <span class="text-sm font-medium text-muted">
          Créer une nouvelle note…
        </span>
      </button>
    </section>

    <section
      v-if="contentItems.length"
      class="mt-14"
      aria-labelledby="content-title"
    >
      <div class="mb-5 flex items-end justify-between gap-4">
        <button
          v-if="selectedFolder !== 'unfiled'"
          class="btn btn-ghost btn-sm"
          type="button"
          @click="
            openFolderModal(selectedFolder === 'all' ? null : selectedFolder)
          "
        >
          <Icon :icon="plusIcon" class="size-4" aria-hidden="true" />
          Nouveau dossier
        </button>
      </div>

      <div class="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
        <template
          v-for="item in contentItems"
          :key="`${item.type}-${item.type === 'folder' ? item.folder.id : item.note.id}`"
        >
          <FolderCard
            v-if="item.type === 'folder'"
            :folder="item.folder"
            :latest-note="item.latestNote"
            :summary="folderSummary(item.folder.id)"
            @open="selectedFolder = $event.id"
            @rename="openRenameFolderModal"
            @delete="requestFolderDeletion"
          />
          <NoteCard
            v-else
            :note="item.note"
            @open="editNote"
            @delete="requestNoteDeletion"
          />
        </template>
      </div>
    </section>

    <section
      v-else
      class="mx-auto mt-16 max-w-2xl text-center"
      aria-labelledby="empty-title"
    >
      <div
        class="mx-auto grid size-16 place-items-center rounded-3xl bg-brand-100 text-brand-700"
      >
        <Icon :icon="fileTextIcon" class="size-7" aria-hidden="true" />
      </div>
      <h2 id="empty-title" class="mt-5 text-base font-semibold">
        {{ search ? "Aucune note trouvée" : "Vos idées commencent ici" }}
      </h2>
      <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
        {{
          search
            ? "Essayez avec d’autres mots-clés."
            : "Ajoutez votre première note. Elle apparaîtra dans cet espace et restera à portée de main."
        }}
      </p>
    </section>
  </main>

  <AppModal
    :open="isComposerOpen && isEditingExistingNote"
    title="Modifier la note"
    size="lg"
    flush
    hide-header
    @close="closeComposer"
  >
    <form @submit.prevent>
      <div class="relative px-5 pr-16">
        <h2 id="edit-note-title" class="sr-only">Modifier la note</h2>
        <!-- <h2 id="edit-note-title" class="text-xs font-semibold tracking-wide text-brand-700 uppercase">
              Modifier la note
            </h2> -->
        <label class="sr-only" for="edit-note-name">Titre de la note</label>
        <input
          id="edit-note-name"
          v-model="title"
          class="input mt-1 block h-auto w-full rounded-none border-0 bg-transparent py-3 text-xl font-semibold outline-none placeholder:font-normal placeholder:text-muted/70 focus:outline-none"
          maxlength="120"
          placeholder="Titre de la note"
          type="text"
        />
        <button
          class="btn btn-circle btn-ghost btn-sm absolute top-1/2 right-4 -translate-y-1/2 text-muted hover:bg-red-50 hover:text-red-600"
          type="button"
          aria-label="Supprimer cette note"
          title="Supprimer"
          @click="requestCurrentNoteDeletion"
        >
          <Icon :icon="trashIcon" class="size-4" aria-hidden="true" />
        </button>
      </div>

      <NoteEditor
        ref="noteEditor"
        v-model="contentHtml"
        v-model:selected-folder="noteFolderId"
        :folders="folderOptions"
        @update:text="contentText = $event"
        @close="closeComposer"
      />
    </form>
  </AppModal>

  <AppModal
    :open="Boolean(notePendingDeletion)"
    title="Supprimer la note ?"
    role="alertdialog"
    elevated
    @close="cancelNoteDeletion"
  >
    <template #header="{ titleId, descriptionId }">
      <div class="flex items-start gap-4">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-full bg-error/10 text-error"
        >
          <Icon :icon="trashIcon" class="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 :id="titleId" class="text-lg font-semibold">
            Supprimer la note ?
          </h2>
          <p
            :id="descriptionId"
            class="mt-2 text-sm leading-6 text-base-content/70"
          >
            <template v-if="notePendingDeletion?.title"
              >La note « {{ notePendingDeletion.title }} » sera supprimée
              définitivement.</template
            >
            <template v-else
              >Cette note sera supprimée définitivement.</template
            >
          </p>
        </div>
      </div>
    </template>

    <template #actions>
      <button class="btn btn-ghost" type="button" @click="cancelNoteDeletion">
        Annuler
      </button>
      <button class="btn btn-error" type="button" @click="confirmNoteDeletion">
        <Icon :icon="trashIcon" class="size-4" aria-hidden="true" />
        Supprimer
      </button>
    </template>
  </AppModal>

  <AppModal
    :open="isFolderModalOpen"
    :title="
      folderBeingRenamed
        ? 'Renommer le dossier'
        : newFolderParentName
          ? 'Nouveau sous-dossier'
          : 'Nouveau dossier'
    "
    size="sm"
    elevated
    @close="closeFolderModal"
  >
    <form @submit.prevent="createFolder">
      <p
        v-if="newFolderParentName && !folderBeingRenamed"
        class="mb-4 text-sm text-base-content/70"
      >
        Dans « {{ newFolderParentName }} »
      </p>
      <label class="mb-1.5 block text-sm font-medium" for="folder-name"
        >Nom du dossier</label
      >
      <input
        id="folder-name"
        v-model="newFolderName"
        class="input input-bordered w-full"
        maxlength="80"
        placeholder="Ex. Travail"
        type="text"
        autofocus
      />
    </form>

    <template #actions>
      <button class="btn btn-ghost" type="button" @click="closeFolderModal">
        Annuler
      </button>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="!newFolderName.trim()"
        @click="createFolder"
      >
        {{ folderBeingRenamed ? "Enregistrer" : "Créer" }}
      </button>
    </template>
  </AppModal>

  <AppModal
    :open="Boolean(folderPendingDeletion)"
    title="Supprimer le dossier ?"
    role="alertdialog"
    elevated
    @close="cancelFolderDeletion"
  >
    <template #header="{ titleId, descriptionId }">
      <div class="flex items-start gap-4">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-full bg-error/10 text-error"
        >
          <Icon :icon="trashIcon" class="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 :id="titleId" class="text-lg font-semibold">
            Supprimer le dossier ?
          </h2>
          <p
            :id="descriptionId"
            class="mt-2 text-sm leading-6 text-base-content/70"
          >
            « {{ folderPendingDeletion?.name }} » et tous ses sous-dossiers
            seront supprimés. Leurs notes seront conservées dans « Sans dossier
            ».
          </p>
        </div>
      </div>
    </template>

    <template #actions>
      <button class="btn btn-ghost" type="button" @click="cancelFolderDeletion">
        Annuler
      </button>
      <button
        class="btn btn-error"
        type="button"
        @click="confirmFolderDeletion"
      >
        <Icon :icon="trashIcon" class="size-4" aria-hidden="true" />
        Supprimer
      </button>
    </template>
  </AppModal>
</template>
