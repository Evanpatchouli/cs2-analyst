// Independent diagnostic only: run in pinned demoinfocs checkout, never product.
package main

import (
	"encoding/json"
	"fmt"
	demo "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/common"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/events"
	st "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/sendtables"
	"os"
	"sort"
	"strconv"
)

func id(p *common.Player) any {
	if p == nil {
		return nil
	}
	return strconv.FormatUint(p.SteamID64, 10)
}
func prop(e st.Entity, name string) any {
	if e == nil {
		return nil
	}
	v, ok := e.PropertyValue(name)
	if !ok {
		return nil
	}
	return v.Any
}
func main() {
	if len(os.Args) != 4 {
		panic("DEM ticks.json output.json")
	}
	b, err := os.ReadFile(os.Args[2])
	if err != nil {
		panic(err)
	}
	var ticks []int
	if err = json.Unmarshal(b, &ticks); err != nil {
		panic(err)
	}
	wanted := map[int]bool{}
	for _, t := range ticks {
		wanted[t] = true
	}
	f, err := os.Open(os.Args[1])
	if err != nil {
		panic(err)
	}
	defer f.Close()
	p := demo.NewParser(f)
	defer p.Close()
	snapshots := []map[string]any{}
	rawOwners := []map[string]any{}
	ev := []map[string]any{}
	warnings := map[string]int{}
	weaponLifetimes := []map[string]any{}
	activeChanges := []map[string]any{}
	p.RegisterEventHandler(func(events.DataTablesParsed) {
		for _, class := range p.ServerClasses().All() {
			class.OnEntityCreated(func(e st.Entity) {
				if _, ok := e.PropertyValue("m_iItemDefinitionIndex"); ok {
					r := map[string]any{"entity": e.ID(), "serial": e.SerialNum(), "class": e.ServerClass().Name(), "created": p.GameState().IngameTick(), "destroyed": nil, "itemIndex": prop(e, "m_iItemDefinitionIndex"), "owners": []map[string]any{}}
					weaponLifetimes = append(weaponLifetimes, r)
					e.Property("m_iItemDefinitionIndex").OnUpdate(func(v st.PropertyValue) { r["itemIndex"] = v.Any })
					if owner := e.Property("m_hOwnerEntity"); owner != nil {
						owner.OnUpdate(func(v st.PropertyValue) {
							r["owners"] = append(r["owners"].([]map[string]any), map[string]any{"tick": p.GameState().IngameTick(), "handle": v.Any})
						})
					}
					e.OnDestroy(func() { r["destroyed"] = p.GameState().IngameTick() })
				}
				if e.ServerClass().Name() == "CCSPlayerPawn" {
					e.Property("m_pWeaponServices.m_hActiveWeapon").OnUpdate(func(v st.PropertyValue) {
						activeChanges = append(activeChanges, map[string]any{"tick": p.GameState().IngameTick(), "pawn": e.ID(), "handle": v.Any})
					})
				}
			})
		}
	})
	event := func(name string, actor any, target any, entity any) {
		ev = append(ev, map[string]any{"event": name, "tick": p.GameState().IngameTick(), "actor": actor, "target": target, "entity": entity})
	}
	p.RegisterEventHandler(func(e events.HeExplode) { event("hegrenade_detonate", id(e.Thrower), nil, e.GrenadeEntityID) })
	p.RegisterEventHandler(func(e events.FlashExplode) { event("flashbang_detonate", id(e.Thrower), nil, e.GrenadeEntityID) })
	p.RegisterEventHandler(func(e events.SmokeStart) { event("smokegrenade_detonate", id(e.Thrower), nil, e.GrenadeEntityID) })
	p.RegisterEventHandler(func(e events.DecoyStart) { event("decoy_started", id(e.Thrower), nil, e.GrenadeEntityID) })
	p.RegisterEventHandler(func(e events.InfernoStart) {
		event("inferno_startburn", id(e.Inferno.Thrower()), nil, e.Inferno.Entity.ID())
	})
	p.RegisterEventHandler(func(e events.PlayerFlashed) {
		var entity any
		if e.Projectile != nil && e.Projectile.Entity != nil {
			entity = e.Projectile.Entity.ID()
		}
		event("player_blind", id(e.Attacker), id(e.Player), entity)
	})
	p.RegisterEventHandler(func(e events.Kill) {
		event("player_death", id(e.Killer), id(e.Victim), nil)
		if e.Weapon != nil {
			ev[len(ev)-1]["weapon"] = e.Weapon.OriginalString
			ev[len(ev)-1]["weaponName"] = e.Weapon.String()
		}
	})
	p.RegisterEventHandler(func(e events.BombPickup) { event("bomb_pickup", id(e.Player), nil, nil) })
	p.RegisterEventHandler(func(e events.BombDropped) { event("bomb_dropped", id(e.Player), nil, e.EntityID) })
	p.RegisterEventHandler(func(e events.BombPlantBegin) { event("bomb_beginplant", id(e.Player), nil, nil) })
	p.RegisterEventHandler(func(e events.BombPlanted) { event("bomb_planted", id(e.Player), nil, nil) })
	p.RegisterEventHandler(func(e events.BombDefuseStart) { event("bomb_begindefuse", id(e.Player), nil, nil) })
	p.RegisterEventHandler(func(e events.BombDefused) { event("bomb_defused", id(e.Player), nil, nil) })
	p.RegisterEventHandler(func(e events.BombExplode) { event("bomb_exploded", id(e.Player), nil, nil) })
	p.RegisterEventHandler(func(e events.ParserWarn) { warnings[fmt.Sprint(e.Type)+":"+e.Message]++ })
	p.RegisterEventHandler(func(events.FrameDone) {
		tick := p.GameState().IngameTick()
		if !wanted[tick] {
			return
		}
		byPawn := map[int]any{}
		for _, player := range p.GameState().Participants().All() {
			pawn := player.PlayerPawnEntity()
			if pawn == nil {
				continue
			}
			byPawn[pawn.ID()] = id(player)
			r := map[string]any{"tick": tick, "steamid": id(player), "controller": player.Entity.ID(), "pawn": pawn.ID(), "pawnSerial": pawn.SerialNum(), "handle": prop(player.Entity, "m_hPlayerPawn"), "activeHandle": prop(pawn, "m_pWeaponServices.m_hActiveWeapon"), "health": prop(pawn, "m_iHealth"), "lifeState": prop(pawn, "m_lifeState"), "team": prop(pawn, "m_iTeamNum"), "weaponEntity": nil, "weaponClass": nil, "weaponIndex": nil, "weaponSerial": nil}
			if w := player.ActiveWeapon(); w != nil && w.Entity != nil {
				r["weaponEntity"] = w.Entity.ID()
				r["weaponClass"] = w.Entity.ServerClass().Name()
				r["weaponIndex"] = prop(w.Entity, "m_iItemDefinitionIndex")
				r["weaponSerial"] = w.Entity.SerialNum()
				r["weaponName"] = w.String()
			}
			inv := []map[string]any{}
			for _, w := range player.Weapons() {
				if w.Entity != nil {
					inv = append(inv, map[string]any{"entity": w.Entity.ID(), "itemIndex": prop(w.Entity, "m_iItemDefinitionIndex")})
				}
			}
			r["inventory"] = inv
			snapshots = append(snapshots, r)
		}
		for _, e := range p.GameState().Entities() {
			for _, field := range []string{"m_hThrower", "m_hOwnerEntity"} {
				if v, ok := e.PropertyValue(field); ok {
					h := v.Handle()
					owner := p.GameState().EntityByHandle(h)
					r := map[string]any{"tick": tick, "entity": e.ID(), "class": e.ServerClass().Name(), "field": field, "handle": h, "ownerEntity": nil, "ownerSteamid": nil}
					if owner != nil {
						r["ownerEntity"] = owner.ID()
						r["ownerSteamid"] = byPawn[owner.ID()]
					}
					rawOwners = append(rawOwners, r)
				}
			}
		}
	})
	if err = p.ParseToEnd(); err != nil {
		panic(err)
	}
	// FrameDone can repeat an ingame tick; native parseTicks returns the last state.
	dedup := func(rows []map[string]any, key func(map[string]any) string) []map[string]any {
		m := map[string]map[string]any{}
		for _, r := range rows {
			m[key(r)] = r
		}
		keys := []string{}
		for k := range m {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out := []map[string]any{}
		for _, k := range keys {
			out = append(out, m[k])
		}
		return out
	}
	snapshots = dedup(snapshots, func(r map[string]any) string { return fmt.Sprintf("%09d/%s", r["tick"], r["steamid"]) })
	rawOwners = dedup(rawOwners, func(r map[string]any) string { return fmt.Sprintf("%09d/%09d/%s", r["tick"], r["entity"], r["field"]) })
	out := map[string]any{"source": "demoinfocs 14db58bad6e6ac2cb794b441c7b3d0d2a6dd1752", "snapshots": snapshots, "rawOwners": rawOwners, "events": ev, "weaponLifetimes": weaponLifetimes, "activeChanges": activeChanges, "warnings": warnings}
	b, err = json.MarshalIndent(out, "", "  ")
	if err != nil {
		panic(err)
	}
	if err = os.WriteFile(os.Args[3], b, 0644); err != nil {
		panic(err)
	}
}
