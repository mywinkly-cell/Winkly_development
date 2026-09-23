/**
 * @jest-environment node
 */
import { RuleTester, type Rule } from "eslint";
import noLiteralString from "../eslint-rules/no-literal-string";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("winkly/no-literal-string", noLiteralString as unknown as Rule.RuleModule, {
  valid: [
    { code: '<Text>{t("home.title")}</Text>' },
    { code: "<Text>{count}</Text>" },
    { code: "<Text>✨ · 2</Text>" },
    { code: "<Text>Winkly</Text>" },
    { code: '<Button title={t("common.save")} />' },
    { code: '<View testID="home-screen" style={styles.row} />' },
    { code: '<Trans i18nKey="x">Hello <b>there</b></Trans>' },
    { code: 'Alert.alert(t("common.error"), t("x.failed"), [{ text: t("common.ok"), style: "cancel" }]);' },
    { code: 'console.log("not user facing");' },
    { code: '<Text>Mine</Text>', options: [{ allow: ["Mine"] }] },
  ],
  invalid: [
    { code: "<Text>Hello</Text>", errors: [{ messageId: "jsxText" }] },
    { code: '<Text>{ok ? "Yes" : t("no")}</Text>', errors: [{ messageId: "jsxText" }] },
    { code: '<Text>{n} member{n === 1 ? "" : "s"}</Text>', errors: [{ messageId: "jsxText" }, { messageId: "jsxText" }] },
    { code: '<Input placeholder="City" />', errors: [{ messageId: "prop" }] },
    { code: '<Pressable accessibilityLabel={`Open ${name}`} />', errors: [{ messageId: "prop" }] },
    { code: '<Header title={name || "Untitled"} />', errors: [{ messageId: "prop" }] },
    {
      code: 'Alert.alert("Error", "Something went wrong", [{ text: "Retry" }, { text: t("common.cancel") }]);',
      errors: [{ messageId: "alert" }, { messageId: "alert" }, { messageId: "alert" }],
    },
    { code: '<Button label="Save" />', options: [{ props: ["label"] }], errors: [{ messageId: "prop" }] },
  ],
});
