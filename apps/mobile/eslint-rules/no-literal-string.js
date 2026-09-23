/**
 * winkly/no-literal-string — flags user-facing text that bypasses i18n.
 *
 * Reports:
 *  - JSX text children with at least one letter:            <Text>Hello</Text>
 *  - string literals in JSX children expressions:          <Text>{ok ? "Yes" : "No"}</Text>
 *  - user-facing props (see DEFAULT_PROPS):                 <Input placeholder="City" />
 *  - Alert.alert / Alert.prompt title + message, and the `text` of each button.
 *
 * Strings without a letter (emoji, punctuation, numbers, "·") are ignored, as are
 * exact matches from the `allow` option (brand names etc.) and children of <Trans>.
 * Values passed through t("…") are call expressions, never literals, so they pass.
 *
 * See docs/I18N.md for why and how this is wired into CI (warn repo-wide, error on
 * files changed in a PR).
 */

const DEFAULT_PROPS = [
  "title",
  "subtitle",
  "label",
  "placeholder",
  "accessibilityLabel",
  "accessibilityHint",
  "headerTitle",
  "headerBackTitle",
];

const DEFAULT_ALLOW = ["Winkly", "OK"];

const LETTER = /\p{L}/u;

function hasLetter(text) {
  return LETTER.test(text);
}

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow hard-coded user-facing strings; use t() from react-i18next (docs/I18N.md).",
    },
    schema: [
      {
        type: "object",
        properties: {
          props: { type: "array", items: { type: "string" } },
          allow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      jsxText: 'Hard-coded text "{{text}}" — use t("…") (see docs/I18N.md).',
      prop: 'Hard-coded {{prop}} "{{text}}" — use t("…") (see docs/I18N.md).',
      alert: 'Hard-coded Alert text "{{text}}" — use t("…") (see docs/I18N.md).',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const props = new Set(options.props ?? DEFAULT_PROPS);
    const allow = new Set([...DEFAULT_ALLOW, ...(options.allow ?? [])]);

    const isUserText = (text) => {
      const trimmed = text.trim();
      return trimmed.length > 0 && hasLetter(trimmed) && !allow.has(trimmed);
    };

    const preview = (text) => {
      const s = text.trim().replace(/\s+/g, " ");
      return s.length > 40 ? `${s.slice(0, 37)}…` : s;
    };

    /**
     * Report every literal that can end up as the value of `node`: follows ternaries,
     * `a || "x"`, `"a" + b` and template literal text, but not function calls (t(), format()).
     */
    function checkExpression(node, messageId, data = {}) {
      if (!node) return;
      switch (node.type) {
        case "Literal":
          if (typeof node.value === "string" && isUserText(node.value)) {
            context.report({ node, messageId, data: { ...data, text: preview(node.value) } });
          }
          return;
        case "TemplateLiteral": {
          const text = node.quasis.map((q) => q.value.cooked ?? "").join(" ");
          if (isUserText(text)) context.report({ node, messageId, data: { ...data, text: preview(text) } });
          return;
        }
        case "ConditionalExpression":
          checkExpression(node.consequent, messageId, data);
          checkExpression(node.alternate, messageId, data);
          return;
        case "LogicalExpression":
          checkExpression(node.left, messageId, data);
          checkExpression(node.right, messageId, data);
          return;
        case "BinaryExpression":
          if (node.operator === "+") {
            checkExpression(node.left, messageId, data);
            checkExpression(node.right, messageId, data);
          }
          return;
        case "JSXExpressionContainer":
          checkExpression(node.expression, messageId, data);
          return;
        case "TSAsExpression":
        case "TSSatisfiesExpression":
          checkExpression(node.expression, messageId, data);
          return;
        default:
          return;
      }
    }

    function elementName(openingElement) {
      const n = openingElement?.name;
      if (!n) return "";
      if (n.type === "JSXIdentifier") return n.name;
      if (n.type === "JSXMemberExpression") return n.property.name;
      return "";
    }

    function insideTrans(node) {
      for (let p = node.parent; p; p = p.parent) {
        if (p.type === "JSXElement" && elementName(p.openingElement) === "Trans") return true;
      }
      return false;
    }

    function isAlertCall(callee) {
      return (
        callee?.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "Alert" &&
        callee.property.type === "Identifier" &&
        (callee.property.name === "alert" || callee.property.name === "prompt")
      );
    }

    return {
      JSXText(node) {
        if (isUserText(node.value) && !insideTrans(node)) {
          context.report({ node, messageId: "jsxText", data: { text: preview(node.value) } });
        }
      },

      JSXExpressionContainer(node) {
        // Only children like <Text>{"Hi"}</Text>; attribute values are handled by JSXAttribute.
        const parentType = node.parent?.type;
        if ((parentType === "JSXElement" || parentType === "JSXFragment") && !insideTrans(node)) {
          checkExpression(node.expression, "jsxText");
        }
      },

      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !props.has(node.name.name)) return;
        checkExpression(node.value, "prop", { prop: node.name.name });
      },

      CallExpression(node) {
        if (!isAlertCall(node.callee)) return;
        const [title, message, buttons] = node.arguments;
        checkExpression(title, "alert");
        checkExpression(message, "alert");
        if (buttons?.type === "ArrayExpression") {
          for (const button of buttons.elements) {
            if (button?.type !== "ObjectExpression") continue;
            for (const prop of button.properties) {
              if (prop.type === "Property" && !prop.computed && prop.key.type === "Identifier" && prop.key.name === "text") {
                checkExpression(prop.value, "alert");
              }
            }
          }
        }
      },
    };
  },
};
