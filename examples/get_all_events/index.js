var {parseEvents, listGameEvents} = require('@counterstrat/demoparser');


const pathToDemo = "path/to/demo.dem"

// If you just want the names of all events then you can use this:
let eventNames = listGameEvents(pathToDemo)

// Currently the event "all" gives you all events. Cursed solution for now
let allEvents = parseEvents(pathToDemo, ["all"])
