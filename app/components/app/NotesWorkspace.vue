<script setup lang="ts">
import fileTextIcon from "@iconify-icons/lucide/file-text";
import plusIcon from "@iconify-icons/lucide/plus";
import searchIcon from "@iconify-icons/lucide/search";
import trashIcon from "@iconify-icons/lucide/trash-2";
import { Icon } from "@iconify/vue";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import Separator from "@/components/ui/separator/Separator.vue";
import AppModal from "./AppModal.vue";
import FolderCard from "./FolderCard.vue";
import FolderSidebar from "./FolderSidebar.vue";
import NoteCard from "./NoteCard.vue";
import NoteEditor from "./NoteEditor.vue";
import { useNotesStore, type Folder, type Note } from "../../stores/notes";
import type { ContentItem } from "../../types/index.ts";

const notesStore = useNotesStore();
const route = useRoute();
const router = useRouter();
const runtime = useRuntime();
const appName = computed(() => runtime.public.appName || "Keep");

const isComposerOpen = ref(false);
const title = ref("");
const contentHtml = ref("");
const contentText = ref("");
const search = ref("");
const isAccountModalOpen = ref(false);
const accountLoading = ref(false);
const accountError = ref("");
const isShareModalOpen = ref(false);
const shareUrl = ref("");
const copiedShareValue = ref<"link" | "session" | null>(null);
const shareError = ref("");
const mergeSessionId = ref("");
const mergeState = ref<"idle" | "merging" | "success" | "error">("idle");
const mergeError = ref("");
const userInitial = computed(
  () => notesStore.currentUser?.name.charAt(0).toLocaleUpperCase("fr") ?? "",
);
const selectedFolder = computed({
  get() {
    if (route.path === "/unfiled") return "unfiled";

    const folderId = route.params.folderId;
    return typeof folderId === "string" ? folderId : "all";
  },
  set(folderId: string) {
    const session = notesStore.sessionId || route.query.session;
    const query = session ? { session: String(session) } : undefined;

    if (folderId === "all") {
      void router.push({ path: "/", query });
      return;
    }
    if (folderId === "unfiled") {
      void router.push({ path: "/unfiled", query });
      return;
    }

    void router.push({
      path: `/folders/${encodeURIComponent(folderId)}`,
      query,
    });
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

function openAccount() {
  if (!notesStore.currentUser) {
    void router.push({ path: "/login", query: route.query });
    return;
  }

  accountError.value = "";
  isAccountModalOpen.value = true;
}

function closeAccount() {
  if (accountLoading.value) return;
  isAccountModalOpen.value = false;
  accountError.value = "";
}

function openProfilePage() {
  isAccountModalOpen.value = false;
  void router.push({ path: "/profile", query: route.query });
}

async function openSessionFromAccount() {
  isAccountModalOpen.value = false;
  await nextTick();
  openShareModal();
}

async function logoutFromAccount() {
  if (accountLoading.value) return;

  accountLoading.value = true;
  accountError.value = "";
  try {
    await notesStore.logout();
    isAccountModalOpen.value = false;
  } catch {
    accountError.value = "La déconnexion a échoué. Veuillez réessayer.";
  } finally {
    accountLoading.value = false;
  }
}

function openShareModal() {
  shareUrl.value = notesStore.sessionShareUrl();
  copiedShareValue.value = null;
  shareError.value = "";
  mergeState.value = "idle";
  mergeError.value = "";
  isShareModalOpen.value = true;
}

function closeShareModal() {
  isShareModalOpen.value = false;
  copiedShareValue.value = null;
  shareError.value = "";
  mergeSessionId.value = "";
  mergeState.value = "idle";
  mergeError.value = "";
}

async function copyShareValue(kind: "link" | "session", value: string) {
  try {
    await navigator.clipboard.writeText(value);
    copiedShareValue.value = kind;
    shareError.value = "";
  } catch {
    shareError.value =
      "La copie a échoué. Sélectionnez la valeur manuellement.";
  }
}

async function mergeSession() {
  mergeState.value = "merging";
  mergeError.value = "";

  try {
    await notesStore.mergeSession(mergeSessionId.value);
    mergeSessionId.value = "";
    mergeState.value = "success";
  } catch (error) {
    mergeState.value = "error";
    mergeError.value =
      error instanceof Error ? error.message : "La fusion a échoué.";
  }
}

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

const folderBreadcrumbs = computed(() => {
  if (selectedFolder.value === "all" || selectedFolder.value === "unfiled") {
    return [];
  }

  const breadcrumbs: Folder[] = [];
  const visited = new Set<string>();
  let folderId: string | null = selectedFolder.value;

  while (folderId && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = notesStore.folders.find((item) => item.id === folderId);
    if (!folder) break;
    breadcrumbs.unshift(folder);
    folderId = folder.parentId;
  }

  return breadcrumbs;
});

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
  <nav
    class="sticky top-0 z-10 flex h-16 w-full items-center gap-2 bg-background/96 px-4 backdrop-blur-xl"
  >
    <div
      @click="selectedFolder = 'all'"
      class="mr-auto px-3 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
    >
      <img src="/logo.png" class="w-8" />

      <span class="font-semibold text-xl">{{ appName }}</span>
    </div>

    <label
      class="relative hidden w-full max-w-md lg:block bg-surface border-transparent focus-within:border-brand-400 border rounded-lg mr-auto"
    >
      <span class="sr-only">Rechercher dans les notes</span>
      <Icon
        :icon="searchIcon"
        class="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-"
        aria-hidden="true"
      />
      <Input
        v-model="search"
        class="h-11 w-full border-transparent bg-transparent pr-4 pl-11 shadow-none"
        placeholder="Rechercher une note…"
        type="search"
      />
    </label>

    <UButton
      variant="ghost"
      size="sm"
      type="button"
      class="rounded-4xl pl-1"
      @click="openAccount"
    >
      <img
        v-if="notesStore.currentUser?.avatar"
        :src="notesStore.currentUser.avatar"
        alt=""
        class="size-6 rounded-full object-cover"
      />
      <UIcon
        v-else
        :name="
          notesStore.currentUser ? 'lucide:circle-user-round' : 'lucide:log-in'
        "
        class="size-4"
        aria-hidden="true"
      />
      <span class="hidden max-w-40 truncate md:inline">
        {{
          notesStore.currentUser?.name ??
          notesStore.currentUser?.email ??
          "Se connecter"
        }}
      </span>
    </UButton>

    <Button
      v-if="!notesStore.currentUser"
      variant="ghost"
      size="sm"
      type="button"
      title="Partager cette session"
      aria-label="Partager cette session"
      @click="openShareModal"
    >
      <UIcon name="lucide:cloud-backup" class="size-4" aria-hidden="true" />
      <span class="hidden md:inline">Session</span>
    </Button>
  </nav>

  <main class="w-full min-w-0 px-4 py-5 sm:px-6">
    <section class="mx-auto max-w-2xl">
      <!-- <p class="mb-2 text-sm font-medium text-brand-700">Bonjour 👋</p>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
        Qu’avez-vous en tête ?
      </h1>
      <p class="mt-3 text-muted">
        Capturez une idée, une tâche ou quelque chose à ne pas oublier.
      </p> -->

      <form
        v-if="isComposerOpen && !isEditingExistingNote"
        class="mt-8 overflow-hidden rounded-card border bg-surface shadow-float"
        @submit.prevent
      >
        <label class="sr-only" for="note-title">Titre de la note</label>
        <Input
          id="note-title"
          v-model="title"
          class="h-auto w-full rounded-none border-0 bg-transparent px-5 py-4 text-base font-semibold shadow-none focus-visible:ring-0"
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

      <Button
        v-else-if="!isEditingExistingNote"
        variant="outline"
        class="mt-4 h-auto min-h-16 w-full justify-start gap-4 rounded-card bg-surface px-3 text-left font-normal shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float"
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
      </Button>
    </section>

    <section
      v-if="contentItems.length"
      class="mt-14"
      aria-labelledby="content-title"
    >
      <div class="mb-5 flex items-end justify-between gap-4">
        <Breadcrumb v-if="selectedFolder !== 'all'" class="ml-2">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink as-child>
                <button type="button" @click="selectedFolder = 'all'">
                  Accueil
                </button>
              </BreadcrumbLink>
            </BreadcrumbItem>

            <template v-if="selectedFolder === 'unfiled'">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Sans dossier</BreadcrumbPage>
              </BreadcrumbItem>
            </template>

            <template
              v-for="(folder, index) in folderBreadcrumbs"
              v-else
              :key="folder.id"
            >
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage v-if="index === folderBreadcrumbs.length - 1">
                  {{ folder.name }}
                </BreadcrumbPage>
                <BreadcrumbLink v-else as-child>
                  <button type="button" @click="selectedFolder = folder.id">
                    {{ folder.name }}
                  </button>
                </BreadcrumbLink>
              </BreadcrumbItem>
            </template>
          </BreadcrumbList>
        </Breadcrumb>

        <div class="mx-auto"></div>

        <Button
          v-if="selectedFolder !== 'unfiled'"
          variant="ghost"
          size="sm"
          type="button"
          @click="
            openFolderModal(selectedFolder === 'all' ? null : selectedFolder)
          "
        >
          <Icon :icon="plusIcon" class="size-4" aria-hidden="true" />
          Nouveau dossier
        </Button>
      </div>

      <UGrid :items="contentItems">
        <template #item="{ item }">
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
      </UGrid>
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
    :open="isAccountModalOpen"
    title="Votre compte"
    size="sm"
    flush
    hide-header
    @close="closeAccount"
  >
    <div
      v-if="notesStore.currentUser"
      class="rounded-[1.75rem] p-3 text-foreground"
    >
      <div class="relative flex min-h-10 items-center justify-center px-11">
        <Button
          variant="ghost"
          size="icon"
          class="absolute top-0 right-0 rounded-full"
          type="button"
          aria-label="Fermer"
          @click="closeAccount"
        >
          <UIcon name="lucide:x" class="size-5" aria-hidden="true" />
        </Button>
      </div>

      <div class="px-4 pt-4 pb-6 text-center">
        <UAvatar class="size-20 mx-auto">
          <UAvatarImage
            v-if="notesStore.currentUser.avatar"
            :src="notesStore.currentUser.avatar"
          />
          <UAvatarFallback class="bg-muted/30 text-3xl">
            {{ userInitial }}
          </UAvatarFallback>
        </UAvatar>

        <h2 class="mt-4 text-xl font-medium">
          {{ notesStore.currentUser.name }} !
        </h2>
        <p class="truncate text-sm">
          {{ notesStore.currentUser.email }}
        </p>
        <Button
          variant="outline"
          size="sm"
          class="mt-4 rounded-full px-5"
          type="button"
          @click="openProfilePage"
        >
          <UIcon name="lucide:user-pen" class="size-4" aria-hidden="true" />
          Modifier le profil
        </Button>
      </div>

      <div class="overflow-hidden rounded-3xl border">
        <Button
          variant="ghost"
          class="h-auto w-full justify-start rounded-none px-5 py-4 text-left"
          type="button"
          @click="openSessionFromAccount"
        >
          <UIcon name="lucide:cloud-backup" class="size-4" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">Votre session</span>
            <span
              class="mt-0.5 block truncate font-mono text-xs font-normal text-muted-foreground"
            >
              {{ notesStore.sessionId }}
            </span>
          </span>
          <UIcon
            name="lucide:chevron-right"
            class="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </Button>

        <Separator />

        <Button
          variant="ghost"
          class="h-auto w-full justify-start rounded-none px-5 py-4 text-left text-destructive hover:bg-destructive/5 hover:text-destructive"
          type="button"
          :disabled="accountLoading"
          @click="logoutFromAccount"
        >
          <UIcon
            :name="accountLoading ? 'lucide:loader-circle' : 'lucide:log-out'"
            class="size-4"
            :class="{ 'animate-spin': accountLoading }"
            aria-hidden="true"
          />
          <span class="text-sm font-medium">
            {{ accountLoading ? "Déconnexion…" : "Se déconnecter" }}
          </span>
        </Button>
      </div>

      <p
        v-if="accountError"
        class="px-4 pt-3 text-center text-sm text-destructive"
        role="alert"
      >
        {{ accountError }}
      </p>

      <p class="px-4 pt-4 pb-1 text-center text-xs text-muted-foreground">
        Connexion sécurisée par code envoyé par e-mail
      </p>
    </div>
  </AppModal>

  <AppModal
    :open="isShareModalOpen"
    title="Partager cette session"
    size="lg"
    elevated
    @close="closeShareModal"
  >
    <p class="mb-5 text-sm leading-6 text-muted-foreground">
      Utilisez le lien sur un autre appareil ou saisissez directement
      l’identifiant de session.
    </p>

    <div class="space-y-5">
      <div>
        <label class="mb-1.5 block text-sm font-medium" for="share-link">
          Lien de partage
        </label>
        <div class="flex w-full">
          <UInput
            id="share-link"
            class="min-w-0 flex-1 rounded-r-none"
            :model-value="shareUrl"
            readonly
            @focus="$event.currentTarget.select()"
          />
          <Button
            class="rounded-l-none"
            type="button"
            @click="copyShareValue('link', shareUrl)"
          >
            <UIcon
              :name="
                copiedShareValue === 'link' ? 'lucide:check' : 'lucide:copy'
              "
              class="size-4"
              aria-hidden="true"
            />
            {{ copiedShareValue === "link" ? "Copié" : "Copier" }}
          </Button>
        </div>
      </div>

      <div>
        <label class="mb-1.5 block text-sm font-medium" for="share-session-id">
          Identifiant de session
        </label>
        <div class="flex w-full">
          <UInput
            id="share-session-id"
            class="min-w-0 flex-1 rounded-r-none font-mono text-xs"
            :model-value="notesStore.sessionId"
            readonly
            @focus="$event.currentTarget.select()"
          />
          <Button
            variant="outline"
            class="rounded-l-none border-l-0"
            type="button"
            @click="copyShareValue('session', notesStore.sessionId)"
          >
            <UIcon
              :name="
                copiedShareValue === 'session' ? 'lucide:check' : 'lucide:copy'
              "
              class="size-4"
              aria-hidden="true"
            />
            {{ copiedShareValue === "session" ? "Copié" : "Copier" }}
          </Button>
        </div>
      </div>

      <div class="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator class="flex-1" />
        Fusionner
        <Separator class="flex-1" />
      </div>

      <form @submit.prevent="mergeSession">
        <label class="mb-1.5 block text-sm font-medium" for="merge-session-id">
          Session à fusionner
        </label>
        <p class="mb-3 text-xs leading-5 text-muted-foreground">
          Les notes et dossiers de cette session seront ajoutés à la session
          courante. La session source restera intacte.
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <Input
            id="merge-session-id"
            v-model="mergeSessionId"
            class="min-w-0 flex-1 font-mono text-xs"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            autocomplete="off"
          />
          <Button
            variant="secondary"
            type="submit"
            :disabled="!mergeSessionId.trim() || mergeState === 'merging'"
          >
            <UIcon
              v-if="mergeState === 'merging'"
              name="lucide:loader-circle"
              class="size-4 animate-spin"
              aria-hidden="true"
            />
            <UIcon
              v-else
              name="lucide:merge"
              class="size-4"
              aria-hidden="true"
            />
            {{ mergeState === "merging" ? "Fusion…" : "Fusionner" }}
          </Button>
        </div>
        <p
          v-if="mergeState === 'success'"
          class="mt-3 text-sm text-green-700"
          role="status"
        >
          Les deux sessions ont été fusionnées.
        </p>
        <p v-if="mergeError" class="mt-3 text-sm text-destructive" role="alert">
          {{ mergeError }}
        </p>
      </form>
    </div>

    <p v-if="shareError" class="mt-4 text-sm text-destructive" role="alert">
      {{ shareError }}
    </p>

    <template #actions>
      <Button variant="outline" type="button" @click="closeShareModal"
        >Fermer</Button
      >
    </template>
  </AppModal>

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
        <Input
          id="edit-note-name"
          v-model="title"
          class="mt-1 block h-auto w-full rounded-none border-0 bg-transparent py-3 text-xl font-semibold shadow-none focus-visible:ring-0"
          maxlength="120"
          placeholder="Titre de la note"
          type="text"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          class="absolute top-1/2 right-4 -translate-y-1/2 text-muted hover:bg-red-50 hover:text-red-600"
          type="button"
          aria-label="Supprimer cette note"
          title="Supprimer"
          @click="requestCurrentNoteDeletion"
        >
          <Icon :icon="trashIcon" class="size-4" aria-hidden="true" />
        </Button>
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
          class="grid size-11 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
        >
          <Icon :icon="trashIcon" class="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 :id="titleId" class="text-lg font-semibold">
            Supprimer la note ?
          </h2>
          <p
            :id="descriptionId"
            class="mt-2 text-sm leading-6 text-muted-foreground"
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
      <Button variant="ghost" type="button" @click="cancelNoteDeletion">
        Annuler
      </Button>
      <Button variant="destructive" type="button" @click="confirmNoteDeletion">
        <Icon :icon="trashIcon" class="size-4" aria-hidden="true" />
        Supprimer
      </Button>
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
        class="mb-4 text-sm text-muted-foreground"
      >
        Dans « {{ newFolderParentName }} »
      </p>
      <label class="mb-1.5 block text-sm font-medium" for="folder-name"
        >Nom du dossier</label
      >
      <Input
        id="folder-name"
        v-model="newFolderName"
        class="w-full"
        maxlength="80"
        placeholder="Ex. Travail"
        type="text"
        autofocus
      />
    </form>

    <template #actions>
      <Button variant="ghost" type="button" @click="closeFolderModal">
        Annuler
      </Button>
      <Button
        type="button"
        :disabled="!newFolderName.trim()"
        @click="createFolder"
      >
        {{ folderBeingRenamed ? "Enregistrer" : "Créer" }}
      </Button>
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
          class="grid size-11 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
        >
          <Icon :icon="trashIcon" class="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 :id="titleId" class="text-lg font-semibold">
            Supprimer le dossier ?
          </h2>
          <p
            :id="descriptionId"
            class="mt-2 text-sm leading-6 text-muted-foreground"
          >
            « {{ folderPendingDeletion?.name }} » et tous ses sous-dossiers
            seront supprimés. Leurs notes seront conservées dans « Sans dossier
            ».
          </p>
        </div>
      </div>
    </template>

    <template #actions>
      <Button variant="ghost" type="button" @click="cancelFolderDeletion">
        Annuler
      </Button>
      <Button
        variant="destructive"
        type="button"
        @click="confirmFolderDeletion"
      >
        <Icon :icon="trashIcon" class="size-4" aria-hidden="true" />
        Supprimer
      </Button>
    </template>
  </AppModal>
</template>
