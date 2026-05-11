package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "Skill Sync Manager",
		Width:     1280,
		Height:    840,
		MinWidth:  960,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 246, G: 247, B: 249, A: 1},
		OnStartup:        app.startup,
		// OnBeforeClose fires when the user triggers window close (X button,
		// Alt-F4, OS close). Returning false from the hook lets the close
		// proceed. Returning true would veto it — we don't, because the
		// project policy is "X means quit".
		OnBeforeClose: app.onBeforeClose,
		// OnShutdown fires after the window is gone, right before wails.Run
		// returns. Last-chance cleanup for any exit path (user close, JS
		// QuitApp call, OS signal in the future). runShutdown is idempotent,
		// so double-firing with OnBeforeClose is harmless.
		OnShutdown: app.onShutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
