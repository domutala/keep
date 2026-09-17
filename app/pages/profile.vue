<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import { useNotesStore } from "../stores/notes";

const notesStore = useNotesStore();
const route = useRoute();
const router = useRouter();

const name = ref("");
const avatar = ref<string | null>(null);
const avatarInput = ref<HTMLInputElement | null>(null);
const loading = ref(true);
const saving = ref(false);
const avatarProcessing = ref(false);
const error = ref("");
const saved = ref(false);

const initial = computed(() => name.value.charAt(0).toLocaleUpperCase("fr-FR"));
const changed = computed(() => {
  const user = notesStore.currentUser;
  return Boolean(
    user && (name.value.trim() !== user.name || avatar.value !== user.avatar),
  );
});

function returnToKeep() {
  const session = notesStore.sessionId || route.query.session;
  void router.push({
    path: "/",
    query: session ? { session: String(session) } : undefined,
  });
}

async function selectAvatar(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  error.value = "";
  saved.value = false;
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
    error.value = "Choisissez une image de moins de 10 Mo.";
    return;
  }

  avatarProcessing.value = true;
  try {
    const bitmap = await createImageBitmap(file);
    const cropSize = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");

    context.drawImage(
      bitmap,
      (bitmap.width - cropSize) / 2,
      (bitmap.height - cropSize) / 2,
      cropSize,
      cropSize,
      0,
      0,
      256,
      256,
    );
    bitmap.close();
    avatar.value = canvas.toDataURL("image/webp", 0.82);
  } catch {
    error.value = "Cette image ne peut pas être utilisée.";
  } finally {
    avatarProcessing.value = false;
  }
}

function removeAvatar() {
  avatar.value = null;
  saved.value = false;
}

async function saveProfile() {
  const normalizedName = name.value.trim().replace(/\s+/g, " ");
  if (!normalizedName || saving.value || avatarProcessing.value) return;

  saving.value = true;
  error.value = "";
  saved.value = false;
  try {
    await notesStore.updateProfile(normalizedName, avatar.value);
    name.value = normalizedName;
    saved.value = true;
  } catch (saveError) {
    error.value =
      saveError instanceof Error
        ? saveError.message
        : "L’enregistrement a échoué.";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await notesStore.loadCurrentUser();
  const user = notesStore.currentUser;
  if (!user) {
    await router.replace({ path: "/login", query: route.query });
    return;
  }

  name.value = user.name;
  avatar.value = user.avatar;
  loading.value = false;
});
</script>

<template>
  <main class="min-h-screen bg-background">
    <nav class="flex h-16 items-center border-b px-4 sm:px-6">
      <Button variant="ghost" type="button" @click="returnToKeep">
        <UIcon name="lucide:arrow-left" class="size-4" aria-hidden="true" />
        Retour à Keep
      </Button>
    </nav>

    <div class="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <div v-if="loading" class="flex justify-center py-24" role="status">
        <UIcon
          name="lucide:loader-circle"
          class="size-6 animate-spin text-muted-foreground"
          aria-label="Chargement du profil"
        />
      </div>

      <template v-else-if="notesStore.currentUser">
        <div class="mb-8">
          <p class="text-sm font-medium text-primary">Votre compte</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight">
            Modifier votre profil
          </h1>
          <p class="mt-2 text-muted-foreground">
            Personnalisez le nom et la photo affichés dans Keep.
          </p>
        </div>

        <form
          class="overflow-hidden rounded-3xl border bg-card"
          @submit.prevent="saveProfile"
        >
          <div class="flex flex-col items-center border-b p-8 text-center">
            <input
              ref="avatarInput"
              class="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              tabindex="-1"
              @change="selectAvatar"
            />
            <button
              class="bg-transparent group relative block size-28 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              type="button"
              :disabled="avatarProcessing || saving"
              aria-label="Modifier la photo de profil"
              @click="avatarInput?.click()"
            >
              <UAvatar v-if="avatar" class="size-28">
                <UAvatarImage :src="avatar" />
              </UAvatar>
              <UAvatar v-else class="size-28">
                <UAvatarFallback class="bg-muted/30">
                  {{ initial }}
                </UAvatarFallback>
              </UAvatar>

              <!-- <img
                v-if="avatar"
                :src="avatar"
                alt="Photo de profil"
                class="size-28 rounded-full object-cover shadow-sm"
              />
              <span
                v-else
                class="grid size-28 place-items-center rounded-full bg-primary text-4xl font-medium text-primary-foreground shadow-sm"
              >
                {{ initial }}
              </span> -->
              <span
                class="absolute right-0 bottom-1 grid size-9 place-items-center rounded-full border-2 border-background bg-background shadow-md transition group-hover:bg-accent"
              >
                <UIcon
                  :name="
                    avatarProcessing ? 'lucide:loader-circle' : 'lucide:camera'
                  "
                  class="size-4"
                  :class="{ 'animate-spin': avatarProcessing }"
                  aria-hidden="true"
                />
              </span>
            </button>

            <div class="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                :disabled="avatarProcessing || saving"
                @click="avatarInput?.click()"
              >
                Changer la photo
              </Button>
              <Button
                v-if="avatar"
                variant="ghost"
                size="sm"
                type="button"
                :disabled="saving"
                @click="removeAvatar"
              >
                Supprimer
              </Button>
            </div>
            <p class="mt-3 text-xs text-muted-foreground">
              PNG, JPEG ou WebP, 10 Mo maximum.
            </p>
          </div>

          <div class="space-y-6 p-6 sm:p-8">
            <div class="space-y-2">
              <label class="text-sm font-medium" for="profile-name">Nom</label>
              <Input
                id="profile-name"
                v-model="name"
                class="h-11"
                maxlength="80"
                autocomplete="name"
                :disabled="saving"
                required
              />
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium" for="profile-email">
                Adresse e-mail
              </label>

              <UInput
                id="profile-email"
                :model-value="notesStore.currentUser.email"
                class="h-11"
                type="email"
                readonly
              />
              <p class="text-xs">
                L’adresse e-mail utilisée pour vous connecter ne peut pas être
                modifiée ici.
              </p>
            </div>

            <p v-if="error" class="text-sm text-destructive" role="alert">
              {{ error }}
            </p>
            <p v-if="saved" class="text-sm text-green-700" role="status">
              Votre profil a été enregistré.
            </p>

            <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="ghost" type="button" @click="returnToKeep">
                Annuler
              </Button>
              <Button
                type="submit"
                :disabled="
                  !name.trim() || !changed || saving || avatarProcessing
                "
              >
                <UIcon
                  v-if="saving"
                  name="lucide:loader-circle"
                  class="size-4 animate-spin"
                  aria-hidden="true"
                />
                {{ saving ? "Enregistrement…" : "Enregistrer" }}
              </Button>
            </div>
          </div>
        </form>
      </template>
    </div>
  </main>
</template>
