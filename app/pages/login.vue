<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/zod";
import { Field as VeeField, useForm } from "vee-validate";
import { ref } from "vue";
import { z } from "zod";
import Button from "@/components/ui/button/Button.vue";
import Input from "@/components/ui/input/Input.vue";
import { useNotesStore } from "../stores/notes";

const notesStore = useNotesStore();
const route = useRoute();
const router = useRouter();

const step = ref<"email" | "code">("email");
const email = ref("");
const loading = ref(false);
const error = ref("");
const lastSubmittedCode = ref("");

function returnToKeep() {
  const session = notesStore.sessionId || route.query.session;
  void router.push({
    path: "/",
    query: session ? { session: String(session) } : undefined,
  });
}

async function requestCode() {
  if (loading.value) return;

  loading.value = true;
  error.value = "";
  try {
    email.value = email.value.trim().toLocaleLowerCase("fr-FR");
    await notesStore.requestLoginCode(email.value);
    lastSubmittedCode.value = "";
    setFieldValue("pin", "");
    step.value = "code";
  } catch (requestError) {
    error.value =
      requestError instanceof Error
        ? requestError.message
        : "Une erreur est survenue.";
  } finally {
    loading.value = false;
  }
}

async function logout() {
  loading.value = true;
  try {
    await notesStore.logout();
    returnToKeep();
  } finally {
    loading.value = false;
  }
}

const otpFormSchema = toTypedSchema(
  z.object({
    pin: z.string().regex(/^\d{6}$/, {
      message: "Le code doit contenir exactement 6 chiffres.",
    }),
  }),
);

const { handleSubmit, submitCount, setFieldValue } = useForm({
  validationSchema: otpFormSchema,
  initialValues: { pin: "" },
});

async function submitCode(pin: string) {
  if (loading.value || pin === lastSubmittedCode.value) return;

  lastSubmittedCode.value = pin;
  loading.value = true;
  error.value = "";
  try {
    await notesStore.verifyLoginCode(email.value, pin);
    returnToKeep();
  } catch (verificationError) {
    error.value =
      verificationError instanceof Error
        ? verificationError.message
        : "Une erreur est survenue.";
    setFieldValue("pin", "");
  } finally {
    loading.value = false;
  }
}

const verifyCode = handleSubmit(({ pin }) => submitCode(pin));

function verifyCompletedCode(pin: string) {
  setFieldValue("pin", pin);
  void submitCode(pin);
}

function editEmail() {
  error.value = "";
  lastSubmittedCode.value = "";
  setFieldValue("pin", "");
  step.value = "email";
}

function handleCodeInput(value: string) {
  error.value = "";
  if (value.length < 6) lastSubmittedCode.value = "";
}

function handleOtpPaste(event: ClipboardEvent) {
  const clipboardValue = event.clipboardData?.getData("text") ?? "";
  const pin = clipboardValue.replace(/\D/g, "").slice(0, 6);

  if (!pin) return;

  event.preventDefault();
  error.value = "";
  lastSubmittedCode.value = "";
  setFieldValue("pin", pin);

  if (pin.length === 6) {
    void submitCode(pin);
  }
}
</script>

<template>
  <main
    class="relative grid min-h-screen place-items-center bg-background px-4 py-10"
  >
    <div class="w-full max-w-xl gap-0">
      <template v-if="notesStore.currentUser">
        <h1 class="text-2xl font-semibold">Votre compte</h1>
        <div class="mt-6 flex items-center gap-3 rounded-xl bg-muted p-4">
          <UIcon name="lucide:circle-user-round" class="size-8 text-primary" />
          <div class="min-w-0">
            <p class="text-xs text-muted-foreground">Connecté avec</p>
            <p class="truncate font-semibold">
              {{ notesStore.currentUser.name }}
            </p>
            <p class="truncate font-medium">
              {{ notesStore.currentUser.email }}
            </p>
          </div>
        </div>
        <div class="mt-7 flex flex-col gap-3 sm:flex-row-reverse">
          <Button class="flex-1" type="button" @click="returnToKeep">
            Continuer vers Keep
          </Button>
          <Button
            variant="destructive"
            type="button"
            :disabled="loading"
            @click="logout"
          >
            Se déconnecter
          </Button>
        </div>
      </template>

      <form
        v-else-if="step === 'email'"
        class="space-y-6"
        @submit.prevent="requestCode"
      >
        <h1 class="text-center text-4xl font-semibold tracking-tight">
          Tout d’abord, saisissez votre e-mail
        </h1>

        <p class="text-center text-base leading-7 text-muted-foreground">
          Nous vous enverrons un code à 6 chiffres pour vous connecter. Aucun
          mot de passe n’est nécessaire.
        </p>

        <div class="space-y-2">
          <label class="sr-only" for="login-email">Adresse e-mail</label>
          <Input
            id="login-email"
            v-model="email"
            class="h-14 w-full px-4 text-lg"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="nom@exemple.com"
            :disabled="loading"
            required
            autofocus
          />
        </div>

        <p v-if="error" class="mt-3 text-sm text-destructive" role="alert">
          {{ error }}
        </p>

        <Button
          class="h-12 w-full text-base font-semibold"
          type="submit"
          :disabled="loading || !email.trim()"
        >
          <UIcon
            v-if="loading"
            name="lucide:loader-circle"
            class="size-4 animate-spin"
          />
          Continuer avec mon adresse e-mail
        </Button>

        <div class="flex items-center gap-4" aria-hidden="true">
          <USeparator class="flex-1" />
          <span class="text-xs font-medium uppercase text-muted-foreground"
            >ou</span
          >
          <USeparator class="flex-1" />
        </div>

        <Button
          variant="ghost"
          class="w-full"
          type="button"
          @click="returnToKeep"
        >
          Continuer sans compte
        </Button>
      </form>

      <div v-else>
        <form id="form-otp" class="space-y-6" @submit.prevent="verifyCode">
          <UFieldGroup>
            <h1 class="text-4xl font-semibold text-center">
              Nous vous avons envoyé un code par e-mail
            </h1>

            <p class="text-center">
              Nous avons envoyé un e-mail à
              <span class="font-semibold">{{ email }} </span>. Saisissez le code
              ici pour continuer. Si vous ne trouvez pas l’e-mail, consultez
              votre dossier Spam ou la corbeille.
            </p>

            <VeeField
              v-slot="{ componentField, errors }"
              name="pin"
              :validate-on-blur="false"
              :validate-on-input="submitCount > 0"
              :validate-on-model-update="submitCount > 0"
            >
              <UField :data-invalid="!!errors.length">
                <!-- <UFieldLabel for="form-otp-pin">
                One-Time Password
              </UFieldLabel> -->

                <div>
                  <UInputOTP
                    id="form-otp-pin"
                    v-bind="componentField"
                    :maxlength="6"
                    :disabled="loading"
                    :aria-invalid="!!errors.length"
                    pattern="^[0-9]+$"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    class="mx-auto w-max"
                    autofocus
                    @complete="verifyCompletedCode"
                    @input="handleCodeInput"
                    @paste.capture="handleOtpPaste"
                  >
                    <UInputOTPGroup>
                      <UInputOTPSlot
                        :index="0"
                        class="text-2xl font-semibold w-16 h-16"
                      />
                      <UInputOTPSlot
                        :index="1"
                        class="text-2xl font-semibold w-16 h-16"
                      />
                      <UInputOTPSlot
                        :index="2"
                        class="text-2xl font-semibold w-16 h-16"
                      />
                    </UInputOTPGroup>
                    <UInputOTPSeparator />
                    <UInputOTPGroup>
                      <UInputOTPSlot
                        :index="3"
                        class="text-2xl font-semibold w-16 h-16"
                      />
                      <UInputOTPSlot
                        :index="4"
                        class="text-2xl font-semibold w-16 h-16"
                      />
                      <UInputOTPSlot
                        :index="5"
                        class="text-2xl font-semibold w-16 h-16"
                      />
                    </UInputOTPGroup>
                  </UInputOTP>
                </div>

                <!-- <UFieldDescription>
                Please enter the one-time password sent to your phone.
              </UFieldDescription> -->
                <UFieldError v-if="errors.length" :errors="errors" />
                <p
                  v-if="error"
                  class="text-center text-sm text-destructive"
                  role="alert"
                >
                  {{ error }}
                </p>
                <p
                  v-if="loading"
                  class="flex items-center justify-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <UIcon
                    name="lucide:loader-circle"
                    class="size-4 animate-spin"
                  />
                  Vérification du code…
                </p>
              </UField>
            </VeeField>
          </UFieldGroup>
        </form>

        <div class="mt-12">
          <p class="text-center">
            Vous ne trouvez pas votre code ?
            <UButton
              variant="link"
              size="sm"
              class="px-2"
              type="button"
              :disabled="loading"
              @click="requestCode"
            >
              Demandez un nouveau code
            </UButton>
          </p>

          <p class="text-center mt-2">
            Vous rencontrez des difficultés ?
            <UButton
              variant="link"
              size="sm"
              class="px-2"
              type="button"
              :disabled="loading"
              @click="editEmail"
            >
              Modifier l’adresse email
            </UButton>
          </p>
        </div>
      </div>
    </div>
  </main>
</template>
