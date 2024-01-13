figma.showUI(__html__, { width: 400, height: 220 });

figma.on("run", ({ parameters }: RunEvent) => {
  const iosSuffix = ["", "@2x", "@3x"];
  const androidSuffix = ["ldpi", "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
  const androidScale = [0.75, 1, 1.5, 2, 3, 4];
  const MAX_SIZE = 4096;

  type FormatType = "JPG" | "PNG" | "SVG" | "PDF";
  type NodesType = readonly SceneNode[];

  figma.ui.onmessage = async (message) => {
    if (message.type === "export") {
      const nodes = figma.currentPage.selection;

      if (nodes.length > 0) {
        try {
          const result = await exportImages(
            nodes,
            message.format,
            message.platform
          );

          figma.ui.postMessage({
            type: "exportImage",
            ...result,
          });
        } catch (error) {
          figma.ui.postMessage({ type: "exportError", error });
        }
      } else {
        figma.ui.postMessage({ type: "unselectedNode" });
      }
    }
    if (message.type === "exportComplete") {
      figma.closePlugin();
    }
  };

  setWarningMessage(
    figma.currentPage.selection,
    figma.root.getPluginData("platform").split(",")
  );

  figma.on("selectionchange", () => {
    setWarningMessage(
      figma.currentPage.selection,
      figma.root.getPluginData("platform").split(",")
    );
  });

  async function exportImages(
    nodes: NodesType,
    format: FormatType,
    platform: string[]
  ) {
    try {
      const imagesPromise = nodes
        .map((node) => {
          let iOSImages: Promise<Uint8Array>[] = [];
          let androidImages: Promise<Uint8Array>[] = [];
          const width = node.width;

          if (platform.find((p) => p === "iOS")) {
            iOSImages = iosSuffix.map((suffix, index) => {
              return node.exportAsync({
                format,
                constraint: {
                  type: "WIDTH",
                  value: Math.round(width * (index + 1)),
                },
              });
            });
          }
          if (platform.find((p) => p === "Android")) {
            androidImages = androidSuffix.map((suffix, index) => {
              return node.exportAsync({
                format,
                constraint: {
                  type: "WIDTH",
                  value: Math.round(width * androidScale[index]),
                },
              });
            });
          }
          return [...iOSImages, ...androidImages];
        })
        .flat();

      // 後でファイル名からプラットフォームを識別するために_IOS_など利用されなそうな文字列を付与する
      let names: string[][] = [];
      nodes.forEach((node) => {
        if (platform.find((p) => p === "iOS")) {
          names.push(iosSuffix.map((suffix) => `_IOS_${node.name}${suffix}`));
        }
        if (platform.find((p) => p === "Android")) {
          names.push(
            androidSuffix.map((suffix) => `_ANDROID_${node.name}_${suffix}`)
          );
        }
      });

      const images = await Promise.all(imagesPromise);
      return { images, names: names.flat(), format: format.toLowerCase() };
    } catch (error) {
      figma.ui.postMessage({
        type: "exportError",
      });
    }
  }

  function hasDuplicateValue(array: string[]) {
    const set = new Set(array);
    return array.length !== set.size;
  }

  function checkMaxSize(nodes: NodesType, platform: string[]) {
    // nodeの最大サイズをチェック 4096px
    const width = Math.max(...nodes.map((node) => node.width));
    const height = Math.max(...nodes.map((node) => node.height));
    const maxScale = platform.find((p) => p === "Android") ? 4 : 3;
    return width * maxScale < MAX_SIZE || height * maxScale < MAX_SIZE;
  }

  function setWarningMessage(nodes: NodesType, platform: string[]) {
    let message: string[] = [];
    const names = nodes.map((node) => node.name);
    if (nodes.length <= 0) {
      message = [];
    }

    if (!checkMaxSize(nodes, platform)) {
      message.push(
        "Contains images that exceed the maximum export size of 4096px."
      );
    }

    //node.nameに重複がある場合はエラーを返す
    if (hasDuplicateValue(names)) {
      message.push("Some of the selected nodes have duplicate names");
    }

    figma.ui.postMessage({
      type: "waringMessage",
      message,
    });
  }
});
