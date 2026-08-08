export const IS_HOSTED_DEMO = process.env.NEXT_PUBLIC_HOSTED_DEMO === "true";

export function modeAvailableOnDeployment(
  mode: "browser" | "backend",
  hostedDemo = IS_HOSTED_DEMO,
) {
  return mode === "browser" || !hostedDemo;
}
