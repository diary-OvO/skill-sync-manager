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
		// OnBeforeClose 在用户触发窗口关闭（X 按钮、Alt-F4、OS 菜单）时触发。
		// 钩子返回 false 表示允许关闭，返回 true 则会否决。
		// 本项目的策略是"点 X 就退出"，因此一律放行。
		OnBeforeClose: app.onBeforeClose,
		// OnShutdown 在窗口销毁之后、wails.Run 返回之前触发，
		// 是所有退出路径（X 按钮、前端调用 QuitApp、未来的 OS 信号）
		// 共同的兜底清理点。runShutdown 是幂等的，与 OnBeforeClose
		// 重复触发也不会有副作用。
		OnShutdown: app.onShutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
