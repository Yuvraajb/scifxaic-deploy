export function isMainModule(url) {
  return url === `file://${process.argv[1]}`;
}
