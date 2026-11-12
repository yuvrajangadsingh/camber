// afterSign: the Windows half of vmp.cjs. electron-builder runs it after editing and signing camber.exe, even when
// there is no certificate, which is when EVS wants it.
exports.default = async ({ electronPlatformName, appOutDir }) => {
  if (electronPlatformName === 'win32') require('./vmp.cjs').sign(appOutDir)
}
