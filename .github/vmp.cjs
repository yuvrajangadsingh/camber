// A production Widevine (VMP) signature from castLabs EVS, which Netflix and Spotify need; ECS ships with a
// development one that only test license servers accept. Runs only when both EVS secrets are set.
// macOS: this afterPack hook, because EVS has to sign before code signing, which electron-builder does next.
// Windows: vmp-win.cjs (afterSign), because electron-builder edits camber.exe's resources after afterPack, which
// would void the signature. Without EVS, Windows has no valid VMP signature at all for the same reason. Linux has no VMP.
const { execFileSync } = require('node:child_process')

exports.sign = (appOutDir) => {
  if (!process.env.EVS_ACCOUNT_NAME || !process.env.EVS_PASSWD) return console.log('  • vmp: no EVS account, not signing')
  // EVS_ACCOUNT_NAME and EVS_PASSWD are read by the EVS client itself
  const evs = (...args) => execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-m', ...args],
    { stdio: 'inherit', env: { ...process.env, EVS_NO_ASK: '1' } })
  evs('castlabs_evs.account', 'reauth')
  evs('castlabs_evs.vmp', 'sign-pkg', appOutDir)
}

exports.default = async ({ electronPlatformName, appOutDir }) => {
  if (electronPlatformName === 'darwin') exports.sign(appOutDir)
}
