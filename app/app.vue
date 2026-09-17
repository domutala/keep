<script setup lang="ts">
import { onMounted } from "vue";
import { useNotesStore } from "./stores/notes";

const notesStore = useNotesStore();
const { initializeTheme } = useTheme();

onMounted(() => {
  initializeTheme();
  void notesStore.initializeSync();
  void notesStore.loadCurrentUser();
});
</script>

<template>
  <RunableLayout :key="String($route.meta.layout ?? 'default')">
    <RunablePage :key="$route.path" />
  </RunableLayout>
</template>
