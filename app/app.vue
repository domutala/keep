<script setup lang="ts">
import { onMounted } from "vue";
import { useNotesStore } from "./stores/notes";

const notesStore = useNotesStore();

onMounted(() => {
  void notesStore.initializeSync();
});
</script>

<template>
  <RunablePage :key="$route.path" />
</template>
