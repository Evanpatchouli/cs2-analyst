// Run from a temporary demoinfocs-golang checkout; no product dependency.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"

	demo "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/common"
	"github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/events"
	st "github.com/markus-wa/demoinfocs-golang/v6/pkg/demoinfocs/sendtables"
)

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
func snapshot(p *common.Player, tick int) map[string]any {
	r := map[string]any{"tick": tick, "steamid": strconv.FormatUint(p.SteamID64, 10), "name": p.Name, "controllerEntityId": nil, "pawnEntityId": nil}
	if p.Entity == nil {
		return r
	}
	r["controllerEntityId"] = p.Entity.ID()
	r["controllerSerial"] = p.Entity.SerialNum()
	for _, f := range []string{"m_steamID", "m_hPawn", "m_hPlayerPawn", "m_iTeamNum", "m_bPawnIsAlive", "m_iConnected"} {
		value := prop(p.Entity, f)
		if f == "m_steamID" && value != nil {
			value = strconv.FormatUint(value.(uint64), 10)
		}
		r[f] = value
	}
	pawn := p.PlayerPawnEntity()
	if pawn == nil {
		return r
	}
	r["pawnEntityId"] = pawn.ID()
	r["pawnSerial"] = pawn.SerialNum()
	r["pawnClass"] = pawn.ServerClass().Name()
	for _, f := range []string{"m_iTeamNum", "m_iHealth", "m_lifeState", "m_ArmorValue", "m_angEyeAngles", "m_hController", "m_pWeaponServices.m_hActiveWeapon"} {
		r["pawn_"+f] = prop(pawn, f)
	}
	// Inspect raw position inputs before calling Position(): zero vector is not absence evidence.
	complete := true
	for _, f := range []string{"CBodyComponent.m_cellX", "CBodyComponent.m_cellY", "CBodyComponent.m_cellZ", "CBodyComponent.m_vecX", "CBodyComponent.m_vecY", "CBodyComponent.m_vecZ"} {
		r[f] = prop(pawn, f)
		if r[f] == nil {
			complete = false
		}
	}
	if complete {
		r["position"] = pawn.Position()
	}
	r["pawnAliveFromLifeState"] = nil
	if life := prop(pawn, "m_lifeState"); life != nil {
		r["pawnAliveFromLifeState"] = life.(uint64) == 0
	}
	return r
}

func main() {
	if len(os.Args) != 4 {
		panic("usage: go run demo2-pawn-oracle.go DEM native-observations.json output.json")
	}
	bytes, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	hash := sha256.Sum256(bytes)
	if hex.EncodeToString(hash[:]) != "253e5b719ac418b092ff3cdd1b5928bb0dfc8ccbf06cb9398963ea1e9fa44a25" {
		panic("fixture identity mismatch")
	}
	input, err := os.ReadFile(os.Args[2])
	if err != nil {
		panic(err)
	}
	var native struct {
		ControlIds []string `json:"controlIds"`
		Boundaries []struct {
			Tick int `json:"tick"`
		} `json:"boundaries"`
		Lifecycle []struct {
			Ticks []int `json:"ticks"`
		} `json:"lifecycle"`
	}
	if err = json.Unmarshal(input, &native); err != nil {
		panic(err)
	}
	selected := map[string]bool{"76561199273439650": true}
	for _, id := range native.ControlIds {
		selected[id] = true
	}
	wanted := map[int]bool{3743: true, 4292: true, 4511: true, 75805: true, 76000: true, 76213: true}
	for _, b := range native.Boundaries {
		wanted[b.Tick] = true
	}
	for _, s := range native.Lifecycle {
		for _, t := range s.Ticks {
			wanted[t] = true
		}
	}
	f, err := os.Open(os.Args[1])
	if err != nil {
		panic(err)
	}
	defer f.Close()
	p := demo.NewParser(f)
	defer p.Close()
	samples := []map[string]any{}
	changes := []map[string]any{}
	counts := map[string]map[string]int{}
	previous := map[string]string{}
	warnings := map[string]int{}
	frames := 0
	first, last := 0, 0
	entityLifecycle := []map[string]any{}
	rawPawns := []map[string]any{}
	p.RegisterEventHandler(func(events.DataTablesParsed) {
		for _, class := range p.ServerClasses().All() {
			class.OnEntityCreated(func(e st.Entity) {
				switch e.ID() {
				case 4, 5, 13, 289, 591, 879, 2927:
					entityLifecycle = append(entityLifecycle, map[string]any{"op": "created", "tick": p.GameState().IngameTick(), "entityId": e.ID(), "serial": e.SerialNum(), "class": e.ServerClass().Name()})
					e.OnDestroy(func() {
						entityLifecycle = append(entityLifecycle, map[string]any{"op": "destroyed", "tick": p.GameState().IngameTick(), "entityId": e.ID(), "serial": e.SerialNum(), "class": e.ServerClass().Name()})
					})
				}
			})
		}
	})
	p.RegisterEventHandler(func(w events.ParserWarn) { warnings[fmt.Sprint(w.Type)+": "+w.Message]++ })
	p.RegisterEventHandler(func(events.FrameDone) {
		tick := p.GameState().IngameTick()
		frames++
		if frames == 1 {
			first = tick
		}
		last = tick
		for _, pl := range p.GameState().Participants().All() {
			id := strconv.FormatUint(pl.SteamID64, 10)
			if !selected[id] {
				continue
			}
			r := snapshot(pl, tick)
			if counts[id] == nil {
				counts[id] = map[string]int{}
			}
			c := counts[id]
			c["frames"]++
			if r["controllerEntityId"] != nil {
				c["controllerFrames"]++
			}
			if r["pawnEntityId"] != nil {
				c["pawnFrames"]++
			}
			if r["position"] != nil {
				c["positionFrames"]++
			}
			if r["pawn_m_iHealth"] != nil {
				c["healthFrames"]++
			}
			if r["pawn_m_iTeamNum"] != nil {
				c["teamFrames"]++
			}
			if r["pawn_m_lifeState"] != nil {
				c["lifeStateFrames"]++
			}
			key := fmt.Sprint(r["controllerEntityId"], "/", r["pawnEntityId"], "/", r["m_hPlayerPawn"], "/", r["m_hPawn"])
			if previous[id] != key {
				changes = append(changes, r)
				previous[id] = key
			}
			if wanted[tick] {
				if id == "76561199273439650" {
					alias := p.GameState().Entities()[879]
					r["index11EntityClass"] = nil
					if alias != nil {
						r["index11EntityClass"] = alias.ServerClass().Name()
					}
				}
				samples = append(samples, r)
			}
		}
		if tick == 3743 || tick == 4292 || tick == 4511 {
			for _, e := range p.GameState().Entities() {
				if e.ServerClass().Name() == "CCSPlayerPawn" {
					rawPawns = append(rawPawns, map[string]any{"tick": tick, "entityId": e.ID(), "serial": e.SerialNum(), "controllerHandle": prop(e, "m_hController"), "health": prop(e, "m_iHealth"), "team": prop(e, "m_iTeamNum")})
				}
			}
		}
	})
	err = p.ParseToEnd()
	parseError := any(nil)
	if err != nil {
		parseError = err.Error()
	}
	ticks := []int{}
	for t := range wanted {
		ticks = append(ticks, t)
	}
	sort.Ints(ticks)
	sort.Slice(rawPawns, func(i, j int) bool {
		if rawPawns[i]["tick"] == rawPawns[j]["tick"] {
			return rawPawns[i]["entityId"].(int) < rawPawns[j]["entityId"].(int)
		}
		return rawPawns[i]["tick"].(int) < rawPawns[j]["tick"].(int)
	})
	result := map[string]any{"sha256": hex.EncodeToString(hash[:]), "parser": "independent demoinfocs-golang current checkout", "parseError": parseError, "frames": frames, "firstTick": first, "lastTick": last, "requestedTicks": ticks, "counts": counts, "identityChanges": changes, "samples": samples, "entityLifecycle": entityLifecycle, "rawPawnsAtFailingTicks": rawPawns, "warnings": warnings, "sampleTiming": "FrameDone after entity updates; exact IngameTick, no nearest-tick join"}
	encoded, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		panic(err)
	}
	if err = os.WriteFile(os.Args[3], append(encoded, '\n'), 0644); err != nil {
		panic(err)
	}
	fmt.Println("Oracle complete:", frames, "frames; counts", counts, "error", parseError)
}
