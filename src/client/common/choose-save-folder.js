const {
  openDialog
} = window.api

export async function chooseSaveDirectory () {
  const savePaths = await openDialog({
    title: window.translate('Choose a folder to save file(s)'),
    message: window.translate('Choose a folder to save file(s)'),
    properties: [
      'openDirectory',
      'showHiddenFiles',
      'createDirectory',
      'noResolveAliases',
      'treatPackageAsDirectory',
      'dontAddToRecent'
    ]
  })
  if (!savePaths || !savePaths.length) {
    return undefined
  }
  return savePaths[0]
}
