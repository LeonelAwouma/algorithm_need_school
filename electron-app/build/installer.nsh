; Personnalisation de l'installateur Windows (chargé automatiquement par electron-builder).
;
; Par défaut, electron-builder embarque l'application dans une archive 7z que l'installateur
; traite en trois temps : copie de l'archive (108 Mo) dans un dossier temporaire, extraction,
; puis copie silencieuse des fichiers vers le dossier final. Chacune de ces étapes recalcule la
; barre de progression : elle monte, est remise à zéro, monte de nouveau, puis retombe.
;
; Ici, on demande à NSIS d'embarquer directement les fichiers de l'application (`File /r`), avec
; son propre compresseur : il n'y a plus qu'une seule étape, et la barre avance sans jamais
; reculer (mesuré : 10 s d'installation, aucun retour en arrière, contre plus de 20 s et plusieurs
; retours en arrière avec l'archive 7z). C'est la branche `APP_BUILD_DIR` prévue par electron-builder mais
; désactivée dans sa version actuelle ; elle s'active en définissant cette constante.
;
; Le dossier de l'application empaquetée est transmis par build/afterPack.js dans la variable
; d'environnement ALGOBABA_APP_DIR (chemin absolu). Sans elle, on garde le comportement par défaut.

!ifndef APP_BUILD_DIR
  !if "$%ALGOBABA_APP_DIR%" != ""
    !define APP_BUILD_DIR "$%ALGOBABA_APP_DIR%"
  !endif
!endif
