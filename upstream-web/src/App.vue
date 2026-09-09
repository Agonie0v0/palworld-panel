<script setup>
import { zhCN, dateZhCN, darkTheme } from "naive-ui";
import pageStore from "@/stores/model/page.js";
import themeStore from "@/stores/model/theme.js";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const theme = themeStore();
const isDarkMode = computed(() => theme.isDark);

const themeOverrides = computed(() => {
  const dark = isDarkMode.value;
  return {
    common: {
      fontFamily:
        '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
      fontFamilyMono:
        '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      primaryColor: dark ? "#00e5a3" : "#0b746b",
      primaryColorHover: dark ? "#2bf0b6" : "#085f57",
      primaryColorPressed: dark ? "#00c48c" : "#064e47",
      primaryColorSuppl: dark ? "rgba(0, 229, 163, 0.2)" : "rgba(11, 116, 107, 0.2)",
      infoColor: "#38bdf8",
      infoColorHover: "#60a5fa",
      successColor: "#10b981",
      successColorHover: "#34d399",
      warningColor: "#fbbf24",
      warningColorHover: "#fcd34d",
      errorColor: "#fb7185",
      errorColorHover: "#f43f5e",
      borderRadius: "8px",
      borderRadiusSmall: "6px",
      cardColor: dark ? "#0e1520" : "#ffffff",
      modalColor: dark ? "#0e1520" : "#ffffff",
      popoverColor: dark ? "#141f2e" : "#ffffff",
      tableColor: dark ? "#0e1520" : "#ffffff",
      borderColor: dark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0",
    },
    Button: {
      borderRadiusMedium: "8px",
      borderRadiusSmall: "6px",
      fontWeight: "600",
    },
    Card: {
      borderRadius: "12px",
    },
    Modal: {
      borderRadius: "14px",
    },
  };
});

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
