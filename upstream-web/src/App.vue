<script setup>
import { zhCN, dateZhCN, darkTheme } from "naive-ui";
import pageStore from "@/stores/model/page.js";
import themeStore from "@/stores/model/theme.js";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const theme = themeStore();
const isDarkMode = computed(() => theme.isDark);

const themeOverrides = {
  common: {
    fontFamily:
      '"Segoe UI Variable", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    fontFamilyMono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    primaryColor: "#0b746b",
    primaryColorHover: "#0f887d",
    primaryColorPressed: "#075e57",
    primaryColorSuppl: "#249a8e",
    infoColor: "#2f6f9f",
    successColor: "#23865f",
    warningColor: "#b87922",
    errorColor: "#c34b5a",
    borderRadius: "6px",
    borderRadiusSmall: "5px",
  },
};

const locale = ref(null);
const uiLocale = ref(null);
const uiDateLocale = ref(null);

// 移动端适配
// 监听窗口宽度变化
let getScreenWidth = function () {
  let scrollWidth = document.documentElement.clientWidth || window.innerWidth;
  pageStore().setScreenWidth(scrollWidth);
};

onMounted(() => {
  theme.init();
  getScreenWidth();
  window.onresize = function () {
    getScreenWidth();
  };

  let localLocale = localStorage.getItem("locale");
  if (localLocale) {
    locale.value = localLocale;
    if (locale.value == "zh") {
      uiLocale.value = zhCN;
      uiDateLocale.value = dateZhCN;
    } else if (locale.value == "en") {
      uiLocale.value = null;
      uiDateLocale.value = null;
    } else {
      localStorage.setItem("locale", "zh");
      locale.value = "zh";
      uiLocale.value = zhCN;
      uiDateLocale.value = dateZhCN;
    }
  } else {
    localStorage.setItem("locale", "zh");
    locale.value = "zh";
    uiLocale.value = zhCN;
    uiDateLocale.value = dateZhCN;
  }
});

onBeforeUnmount(() => {
  window.onresize = null;
});
</script>

<template>
  <n-config-provider
    :locale="uiLocale"
    :date-locale="uiDateLocale"
    :theme-overrides="themeOverrides"
    :theme="isDarkMode ? darkTheme : null"
  >
    <n-dialog-provider>
      <n-notification-provider>
        <n-message-provider>
          <div class="app-theme" :class="{ 'is-dark': isDarkMode }">
            <router-view />
          </div>
        </n-message-provider>
      </n-notification-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
