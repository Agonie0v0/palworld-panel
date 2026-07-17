<script setup>
import { zhCN, dateZhCN, jaJP, dateJaJP, darkTheme } from "naive-ui";
import pageStore from "@/stores/model/page.js";
import { onBeforeUnmount, onMounted } from "vue";

const isDarkMode = ref(
  window.matchMedia("(prefers-color-scheme: dark)").matches,
);

const updateDarkMode = (e) => {
  isDarkMode.value = e.matches;
};
let mediaQuery;

const themeOverrides = {
  common: {
    fontFamily:
      '"Segoe UI Variable", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    fontFamilyMono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    primaryColor: "#0f766e",
    primaryColorHover: "#0d9488",
    primaryColorPressed: "#115e59",
    primaryColorSuppl: "#14b8a6",
    infoColor: "#2563eb",
    successColor: "#16855b",
    warningColor: "#b7791f",
    errorColor: "#c2414f",
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
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", updateDarkMode);
  isDarkMode.value = mediaQuery.matches;
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
    } else if (locale.value == "ja") {
      uiLocale.value = jaJP;
      uiDateLocale.value = dateJaJP;
    } else if (locale.value == "en") {
      uiLocale.value = null;
      uiDateLocale.value = null;
    }
  } else {
    localStorage.setItem("locale", "zh");
    locale.value = "zh";
    uiLocale.value = zhCN;
    uiDateLocale.value = dateZhCN;
  }
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener("change", updateDarkMode);
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
