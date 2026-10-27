(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StudyBridgeUploadLimits = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  const courseFileBytes = 50 * 1024 * 1024;
  return Object.freeze({ courseFileBytes, courseRequestBytes: Math.ceil(courseFileBytes / 3) * 4 + 1024 * 1024 });
});
