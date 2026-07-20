<template>
    <div>
      <p class="mb-2">Please respond YES to confirm you are safe</p>
      <button @click="handleConfirm" class="bg-green-500 text-white font-semibold px-4 py-2 rounded shadow hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400">
        YES
      </button>
    </div>
  </template>
  
  <script>
  export default {
    emits: ["confirm"],
    methods: {
      handleConfirm() {
        this.$emit("confirm");
      },
    },
  };
  </script>
  