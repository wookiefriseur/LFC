-- Every global a chunk reads or writes
-- Shared by the static validators

---@param path string file to compile
---@param luac string luac binary
---@return table|nil names, string|nil err
local function globalNames(path, luac)
  local pipe = io.popen('"' .. luac .. '" -p -l "' .. path .. '" 2>&1')
  if not pipe then
    return nil, "cannot run " .. luac
  end
  local listing = pipe:read("*a")
  pipe:close()
  if listing == "" then
    return nil, "no bytecode listing for " .. path
  end
  local names = {}
  -- 5.1 lists `GETGLOBAL 0 -1 ; name`, 5.2+ lists `GETTABUP 0 0 -1 ; _ENV "name"`
  for name in listing:gmatch("[GS]ETGLOBAL[^;\n]*;%s+([%a_][%w_]*)") do
    names[name] = true
  end
  for name in listing:gmatch('_ENV%s+"([%a_][%w_]*)"') do
    names[name] = true
  end
  return names
end

return globalNames
