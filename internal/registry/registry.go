// Package registry 负责在用户的共享 skill 根目录旁边，持久化每个 skill 的
// 元数据（来源 / 是否隐藏 / 是否冻结 / 导入信息），存放于
// .skill-manager/registry.json。skill 自身的目录不会被本包修改。
package registry

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"skill-sync-manager/internal/models"
)

const (
	// DirName 是共享根下存放注册表状态的目录名。
	// 故意以 `.` 开头，让常规工具自动忽略它。
	DirName = ".skill-manager"
	// FileName 是注册表 JSON 文件名。
	FileName = "registry.json"
	// CurrentVersion 是本版本写出的 schema 版本号。
	CurrentVersion = 1
)

// Entry 描述单个 skill 的元数据。
type Entry struct {
	Origin         models.SkillOrigin `json:"origin,omitempty"`
	Hidden         bool               `json:"hidden,omitempty"`
	Frozen         bool               `json:"frozen,omitempty"`
	ImportedFrom   string             `json:"importedFrom,omitempty"`
	ImportedAtUnix int64              `json:"importedAtUnix,omitempty"`
}

// Registry 对应 registry.json 的顶层 JSON 文档。
type Registry struct {
	Version int              `json:"version"`
	Skills  map[string]Entry `json:"skills"`
}

// NewEmpty 返回一个当前版本号的空注册表。
func NewEmpty() Registry {
	return Registry{Version: CurrentVersion, Skills: map[string]Entry{}}
}

// Path 返回共享根对应的 registry.json 绝对路径，不会创建文件。
func Path(sharedRoot string) (string, error) {
	if sharedRoot == "" {
		return "", errors.New("shared root must not be empty")
	}
	abs, err := filepath.Abs(sharedRoot)
	if err != nil {
		return "", err
	}
	return filepath.Join(abs, DirName, FileName), nil
}

// Load 读取指定共享根下的注册表。
// 文件不存在不视为错误，会返回空注册表；
// 文件损坏时返回空注册表 + 解析错误，调用方可记录日志后继续使用默认值。
func Load(sharedRoot string) (Registry, error) {
	p, err := Path(sharedRoot)
	if err != nil {
		return NewEmpty(), err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return NewEmpty(), nil
		}
		return NewEmpty(), err
	}
	var reg Registry
	if err := json.Unmarshal(data, &reg); err != nil {
		return NewEmpty(), fmt.Errorf("registry.json is corrupt: %w", err)
	}
	if reg.Skills == nil {
		reg.Skills = map[string]Entry{}
	}
	if reg.Version == 0 {
		reg.Version = CurrentVersion
	}
	return reg, nil
}

// Save 原子性地把注册表写入磁盘。
// 若父目录不存在会自动创建；先写入同目录下的临时文件，再 rename 覆盖，
// 因此读者永远不会读到写了一半的文件。
func Save(sharedRoot string, reg Registry) error {
	p, err := Path(sharedRoot)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	if reg.Skills == nil {
		reg.Skills = map[string]Entry{}
	}
	if reg.Version == 0 {
		reg.Version = CurrentVersion
	}
	data, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(p), ".registry-*.json.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	removeTmp := func() { _ = os.Remove(tmpName) }
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		removeTmp()
		return err
	}
	if err := tmp.Close(); err != nil {
		removeTmp()
		return err
	}
	if err := os.Rename(tmpName, p); err != nil {
		removeTmp()
		return err
	}
	return nil
}

// Get 返回 name 对应的条目，同时返回一个 bool 指示是否存在显式条目。
// 默认值：Origin = owned、Hidden = false、Frozen = false。
func (r Registry) Get(name string) (Entry, bool) {
	if r.Skills == nil {
		return defaultEntry(), false
	}
	e, ok := r.Skills[name]
	if !ok {
		return defaultEntry(), false
	}
	if e.Origin == "" {
		e.Origin = models.SkillOriginOwned
	}
	return e, true
}

// Set 写入一条 name 的注册表条目（原地修改）。
// Origin 为空时会被规范为 owned。
func (r *Registry) Set(name string, e Entry) {
	if r.Skills == nil {
		r.Skills = map[string]Entry{}
	}
	if e.Origin == "" {
		e.Origin = models.SkillOriginOwned
	}
	r.Skills[name] = e
}

// Delete 按名称移除一条条目；对不存在的 name 也是安全的。
func (r *Registry) Delete(name string) {
	if r.Skills == nil {
		return
	}
	delete(r.Skills, name)
}

// PruneMissing 删除不在 existing 集合中的所有条目。
// 共享根扫描完成后会调用本方法，使得在应用外部被删除的 skill，
// 其元数据能自动清理掉。
func (r *Registry) PruneMissing(existing map[string]bool) int {
	if r.Skills == nil {
		return 0
	}
	removed := 0
	for name := range r.Skills {
		if !existing[name] {
			delete(r.Skills, name)
			removed++
		}
	}
	return removed
}

func defaultEntry() Entry {
	return Entry{Origin: models.SkillOriginOwned}
}
