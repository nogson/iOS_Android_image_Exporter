figma.showUI(__html__, { width: 400, height: 220 });

figma.on("run", ({ parameters }: RunEvent) => {
  const iosSuffix = ["", "@2x", "@3x"];
  const androidSuffix = ["ldpi", "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
  const androidScale = [0.75, 1, 1.5, 2, 3, 4];

  type FormatType = "JPG" | "PNG" | "SVG" | "PDF";
  type NodesType = readonly SceneNode[];

  const exportImages = async (
    nodes: NodesType,
    format: FormatType,
    platform: string[]
  ) => {
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

      //node.nameに重複がある場合はエラーを返す
      if (hasDuplicateValue(names.flat())) {
        figma.ui.postMessage({ type: "hasDuplicateValue" });
        return;
      }
      const images = await Promise.all(imagesPromise);
      return { images, names: names.flat(), format: format.toLowerCase() };
    } catch (error) {
      console.error("画像の書き出しエラー", error);
      throw error;
    }

    function hasDuplicateValue(array: string[]) {
      const set = new Set(array);
      return array.length !== set.size;
    }
  };

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
          figma.ui.postMessage({ type: "exportImage", ...result });
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
});
