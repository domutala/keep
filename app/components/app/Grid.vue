<script setup lang="ts">
import { MasonryWall } from "@yeger/vue-masonry-wall";
import type { ContentItem } from "../../types";

defineProps<{ items: ContentItem[] }>();
</script>

<template>
  <MasonryWall :items="items" :ssr-columns="1" :column-width="300" :gap="16">
    <template #default="{ item, index }">
      <div>
        <slot name="item" :item />
      </div>
    </template>
  </MasonryWall>
</template>
