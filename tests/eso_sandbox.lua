-- Minimal ESO environment for loading lib files outside ESO
-- Unknown SI_* globals become ids and the name lookups return marker strings, so a file that only wants "some id" and "some name" loads unchanged
-- Shared by the static validators

local function makeSandbox()
  local nextStringId, stringIds = 1000000, {}
  local env = { FurC = {}, LibFurnitureCatalogue = { Internal = {} } }
  setmetatable(env, {
    __index = function(_, key)
      local v = rawget(_G, key)
      if v ~= nil then
        return v
      end
      if key:match("^SI_") then
        if not stringIds[key] then
          nextStringId = nextStringId + 1
          stringIds[key] = nextStringId
        end
        return stringIds[key]
      end
      return nil
    end,
  })
  env._G = env
  env.GetString = function(id)
    return "string:" .. tostring(id)
  end
  env.GetZoneNameById = function(id)
    return "zone:" .. tostring(id)
  end
  env.GetCrownCrateName = function(id)
    return "crate:" .. tostring(id)
  end
  env.GetSkillLineNameById = function(id)
    return "skillLine:" .. tostring(id)
  end
  env.zo_strformat = function(_, value)
    return tostring(value)
  end
  return env
end

return makeSandbox
