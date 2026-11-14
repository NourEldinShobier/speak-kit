import type { APPS } from "../apps";

/** The installed-programs suggestions beside a program field. */
export const AR_APPS: Record<keyof typeof APPS, string> = {
  "apps.loading": "جارٍ البحث عن التطبيقات المثبّتة...",
  "apps.unavailable": "تعذّر عرض قائمة التطبيقات المثبّتة هنا. اكتب اسم البرنامج بدلًا من ذلك.",
  "apps.noneFor": "لا يوجد تطبيق مثبّت يطابق «{query}». ما زال بإمكانك إضافة الاسم الذي كتبته. قد لا تظهر تطبيقات المتجر: اكتب اسمها.",
  "apps.none": "لم يُعثر على تطبيقات مثبّتة. لا تظهر تطبيقات متجر Microsoft: اكتب اسمها.",
  "apps.group": "التطبيقات المثبّتة",
  "apps.use": "استخدام {name}",
};
