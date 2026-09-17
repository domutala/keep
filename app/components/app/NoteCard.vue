<script setup lang="ts">
import Button from "@/components/ui/button/Button.vue";
import Card from "@/components/ui/card/Card.vue";
import type { Category, Note } from "../../stores/notes";

defineProps<{ note: Note; category?: Category | null }>();

const emit = defineEmits<{
  open: [note: Note];
  delete: [note: Note];
}>();

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
</script>

<template>
  <Card
    class="group relative mb-4 cursor-pointer break-inside-avoid gap-0 rounded-card p-5 py-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float focus-visible:-translate-y-0.5 focus-visible:shadow-float"
    role="button"
    tabindex="0"
    :aria-label="`Modifier la note ${note.title || 'sans titre'}`"
    @click="emit('open', note)"
    @keydown.enter="emit('open', note)"
    @keydown.space.prevent="emit('open', note)"
  >
    <Button
      variant="ghost"
      size="icon-sm"
      class="absolute top-3 right-3 bg-surface/90 text-muted opacity-0 shadow-sm hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
      type="button"
      :aria-label="`Supprimer la note ${note.title || 'sans titre'}`"
      title="Supprimer"
      @click.stop="emit('delete', note)"
      @keydown.stop
    >
      <UIcon name="lucide:trash-2" class="size-4" aria-hidden="true" />
    </Button>

    <h3 v-if="note.title" class="font-semibold leading-6">{{ note.title }}</h3>
    <div
      v-if="note.format === 'rich-text'"
      class="note-content line-clamp-5 text-sm leading-6 text-ink/85"
      :class="{ 'mt-2': note.title }"
      v-html="note.contentHtml"
    />
    <p
      v-else
      class="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-ink/85"
      :class="{ 'mt-2': note.title }"
    >
      {{ note.content }}
    </p>

    <div class="flex items-center justify-between mt-5">
      <span
        v-if="category"
        class="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg px-2 py-2 text-xs font-medium w-max"
        :style="{
          backgroundColor: `${category.color}26`,
          color: category.color,
        }"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :style="{ backgroundColor: category.color }"
          aria-hidden="true"
        />
        <span class="truncate">{{ category.name }}</span>
      </span>

      <time class="block text-xs text-muted" :datetime="note.createdAt">
        {{ formatDate(note.createdAt) }}
      </time>
    </div>
  </Card>
</template>
