module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Required by react-native-reanimated (a stream-chat-expo peer dep).
    // Must be the last plugin.
    plugins: ["react-native-reanimated/plugin"],
  };
};
