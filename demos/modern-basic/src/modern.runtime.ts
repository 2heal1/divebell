import { defineRuntimeConfig } from "@modern-js/runtime";
import { divebellModernPlugin } from "@divebell/modern-plugin";

export default defineRuntimeConfig({
  plugins: [
    divebellModernPlugin({
      bridge: {
        port: 17321
      },
      injectRouteListAction: true,
      injectRouteNavigateAction: true
    })
  ]
});
