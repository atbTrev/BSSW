var toggleLayers = [];
var toggleNames = [];
var toggleIcons = [];
var markers = [];
var playedMarkers = [];
var followMe = false;
var jsonArray = "";
var currentKml = "";
var selectedKml = "";
var currentName = "";
var selectedName = "";
var playSpeech = true;
var defaultZoomLevel = 14;
var markerSpeechDetectionRadius = 50;
var kmlStore;

L.KML = L.FeatureGroup.extend({

	initialize: function (kml) {
		this._kml = kml;
		this._layers = {};

		if (kml) {
			this.addKML(kml);
		}
	},

	addKML: function (xml) {
		var layers = L.KML.parseKML(xml);
		if (!layers || !layers.length) return;
		for (var i = 0; i < layers.length; i++) {
			this.fire('addlayer', {
				layer: layers[i]
			});
			this.addLayer(layers[i]);			
		}		
		this.latLngs = L.KML.getLatLngs(xml);
		this.fire('loaded');
	},

	latLngs: []
});


L.KMLLayerGroups = L.FeatureGroup.extend({

	initialize: function (kml) {
		this._kml = kml;
		this._layers = {};

		if (kml) {
			this.addKML(kml);
		}
	},

	addKML: function (xml) {
		var layers = L.KML.parseKML(xml);
		if (!layers || !layers.length) return;
		for (var i = 0; i < layers.length; i++) {
			this.fire('addlayer', {
				layer: layers[i]
			});
			this.addLayer(layers[i]);			
		}		
		this.latLngs = L.KML.getLatLngs(xml);
		this.fire('loaded');
	},

	latLngs: []
});

L.Util.extend(L.KML, {

	parseKML: function (xml) {
		var style = this.parseStyles(xml);		
		
		this.parseStyleMap(xml, style);
		
		var el = xml.getElementsByTagName('Folder');
		var layers = [], l;
		for (var i = 0; i < el.length; i++) {
			if (!this._check_folder(el[i])) { continue; }
			l = this.parseFolder(el[i], style);			
			if (l) { layers.push(l);					 
				     toggleLayers.push(l);					 
				     toggleNames.push(el[i].getElementsByTagName('name')[0].childNodes[0].nodeValue.trim());
				     var iconUrl = getIconUrl(el[i], style);
				     toggleIcons.push(iconUrl);
				 }
		}
		el = xml.getElementsByTagName('Placemark');
		for (var j = 0; j < el.length; j++) {
			if (!this._check_folder(el[j])) { continue; }
			l = this.parsePlacemark(el[j], xml, style);
			if (l) { layers.push(l); }
		}
		el = xml.getElementsByTagName('GroundOverlay');
		for (var k = 0; k < el.length; k++) {
			l = this.parseGroundOverlay(el[k]);
			if (l) { layers.push(l); }
		}		
		return layers;
	},

	// Return false if e's first parent Folder is not [folder]
	// - returns true if no parent Folders
	_check_folder: function (e, folder) {
		e = e.parentNode;
		while (e && e.tagName !== 'Folder')
		{
			e = e.parentNode;
		}
		return !e || e === folder;
	},

	parseStyles: function (xml) {
		var styles = {};
		var sl = xml.getElementsByTagName('Style');
		for (var i=0, len=sl.length; i<len; i++) {
			var style = this.parseStyle(sl[i]);
			if (style) {
				var styleName = '#' + style.id;
				styles[styleName] = style;				
			}
		}
		return styles;
	},

	parseStyle: function (xml) {
		var style = {}, poptions = {}, ioptions = {}, el, id;

		var attributes = {color: true, width: true, Icon: true, href: true, hotSpot: true};

		function _parse (xml) {
			var options = {};
			for (var i = 0; i < xml.childNodes.length; i++) {
				var e = xml.childNodes[i];
				var key = e.tagName;
				if (!attributes[key]) { continue; }
				if (key === 'hotSpot')
				{
					for (var j = 0; j < e.attributes.length; j++) {
						options[e.attributes[j].name] = e.attributes[j].nodeValue;
					}
				} else {
					var value = e.childNodes[0].nodeValue;
					if (key === 'color') {
						options.opacity = parseInt(value.substring(0, 2), 16) / 255.0;
						options.color = '#' + value.substring(6, 8) + value.substring(4, 6) + value.substring(2, 4);
					} else if (key === 'width') {
						options.weight = value;
					} else if (key === 'Icon') {
						ioptions = _parse(e);
						if (ioptions.href) { options.href = ioptions.href; }
					} else if (key === 'href') {
						options.href = value;
					}
				}
			}
			return options;
		}

		el = xml.getElementsByTagName('LineStyle');
		if (el && el[0]) { style = _parse(el[0]); }
		el = xml.getElementsByTagName('PolyStyle');
		if (el && el[0]) { poptions = _parse(el[0]); }
		if (poptions.color) { style.fillColor = poptions.color; }
		if (poptions.opacity) { style.fillOpacity = poptions.opacity; }
		el = xml.getElementsByTagName('IconStyle');
		if (el && el[0]) { ioptions = _parse(el[0]); }
		if (ioptions.href) {
			style.icon = new L.KMLIcon({
				iconUrl: ioptions.href,
				shadowUrl: null,
				anchorRef: {x: ioptions.x, y: ioptions.y},
				anchorType:	{x: ioptions.xunits, y: ioptions.yunits}
			});
		}

		id = xml.getAttribute('id');
		if (id && style) {
			style.id = id;
		}

		return style;
	},

	parseStyleMap: function (xml, existingStyles) {
		var sl = xml.getElementsByTagName('StyleMap');

		for (var i = 0; i < sl.length; i++) {
			var e = sl[i], el;
			var smKey, smStyleUrl;

			el = e.getElementsByTagName('key');
			if (el && el[0]) { smKey = el[0].textContent; }
			el = e.getElementsByTagName('styleUrl');
			if (el && el[0]) { smStyleUrl = el[0].textContent; }

			if (smKey === 'normal')
			{
				existingStyles['#' + e.getAttribute('id')] = existingStyles[smStyleUrl];
			}
		}

		return;
	},

	parseFolder: function (xml, style) {
		var el, layers = [], l;
		//console.log(xml);
		//console.log(xml.getElementsByTagName('name')[0].childNodes[0].nodeValue.trim());
		el = xml.getElementsByTagName('Folder');		
		for (var i = 0; i < el.length; i++) {
			if (!this._check_folder(el[i], xml)) { continue; }
			l = this.parseFolder(el[i], style);								
			if (l) { layers.push(l); }
		}
		el = xml.getElementsByTagName('Placemark');
		for (var j = 0; j < el.length; j++) {
			if (!this._check_folder(el[j], xml)) { continue; }
			l = this.parsePlacemark(el[j], xml, style);
			if (l) { layers.push(l); }
		}
		el = xml.getElementsByTagName('GroundOverlay');
		for (var k = 0; k < el.length; k++) {
			if (!this._check_folder(el[k], xml)) { continue; }
			l = this.parseGroundOverlay(el[k]);
			if (l) { layers.push(l); }
		}
		if (!layers.length) { return; }
		if (layers.length === 1) { return layers[0]; }
		return new L.FeatureGroup(layers);
	},

	parsePlacemark: function (place, xml, style, options) {
		var h, i, j, k, el, il, opts = options || {};

		el = place.getElementsByTagName('styleUrl');
		for (i = 0; i < el.length; i++) {
			var url = el[i].childNodes[0].nodeValue;
			for (var a in style[url]) {
				opts[a] = style[url][a];
			}
		}

		il = place.getElementsByTagName('Style')[0];
		if (il) {
			var inlineStyle = this.parseStyle(place);
			if (inlineStyle) {
				for (k in inlineStyle) {
					opts[k] = inlineStyle[k];
				}
			}
		}

		var multi = ['MultiGeometry', 'MultiTrack', 'gx:MultiTrack'];
		for (h in multi) {
			el = place.getElementsByTagName(multi[h]);
			for (i = 0; i < el.length; i++) {
				return this.parsePlacemark(el[i], xml, style, opts);
			}
		}

		var layers = [];

		var parse = ['LineString', 'Polygon', 'Point', 'Track', 'gx:Track'];
		for (j in parse) {
			var tag = parse[j];
			el = place.getElementsByTagName(tag);
			for (i = 0; i < el.length; i++) {
				var l = this['parse' + tag.replace(/gx:/, '')](el[i], xml, opts);
				if (l) { layers.push(l); }
			}
		}

		if (!layers.length) {
			return;
		}
		var layer = layers[0];
		if (layers.length > 1) {
			layer = new L.FeatureGroup(layers);
		}

		var name, descr = '';
		el = place.getElementsByTagName('name');
		if (el.length && el[0].childNodes.length) {
			name = el[0].childNodes[0].nodeValue;
		}
		el = place.getElementsByTagName('description');
		for (i = 0; i < el.length; i++) {
			for (j = 0; j < el[i].childNodes.length; j++) {
				descr = descr + el[i].childNodes[j].nodeValue;
			}
		}

		if (name) {
			layer.on('add', function () {
				layer.bindPopup('<h2>' + name + '</h2>' + urlify(descr), { className: 'kml-popup'});
			});
		}

		return layer;
	},

	parseCoords: function (xml) {
		var el = xml.getElementsByTagName('coordinates');
		return this._read_coords(el[0]);
	},

	parseLineString: function (line, xml, options) {
		var coords = this.parseCoords(line);
		if (!coords.length) { return; }
		return new L.Polyline(coords, options);
	},

	parseTrack: function (line, xml, options) {
		var el = xml.getElementsByTagName('gx:coord');
		if (el.length === 0) { el = xml.getElementsByTagName('coord'); }
		var coords = [];
		for (var j = 0; j < el.length; j++) {
			coords = coords.concat(this._read_gxcoords(el[j]));
		}
		if (!coords.length) { return; }
		return new L.Polyline(coords, options);
	},

	parsePoint: function (line, xml, options) {
		var el = line.getElementsByTagName('coordinates');
		if (!el.length) {
			return;
		}
		var ll = el[0].childNodes[0].nodeValue.split(',');
		return new L.KMLMarker(new L.LatLng(ll[1], ll[0]), options);
	},

	parsePolygon: function (line, xml, options) {
		var el, polys = [], inner = [], i, coords;
		el = line.getElementsByTagName('outerBoundaryIs');
		for (i = 0; i < el.length; i++) {
			coords = this.parseCoords(el[i]);
			if (coords) {
				polys.push(coords);
			}
		}
		el = line.getElementsByTagName('innerBoundaryIs');
		for (i = 0; i < el.length; i++) {
			coords = this.parseCoords(el[i]);
			if (coords) {
				inner.push(coords);
			}
		}
		if (!polys.length) {
			return;
		}
		if (options.fillColor) {
			options.fill = true;
		}
		if (polys.length === 1) {
			return new L.Polygon(polys.concat(inner), options);
		}
		return new L.MultiPolygon(polys, options);
	},

	getLatLngs: function (xml) {
		var el = xml.getElementsByTagName('coordinates');
		var coords = [];
		for (var j = 0; j < el.length; j++) {
			// text might span many childNodes
			coords = coords.concat(this._read_coords(el[j]));
		}
		return coords;
	},

	_read_coords: function (el) {
		var text = '', coords = [], i;
		for (i = 0; i < el.childNodes.length; i++) {
			text = text + el.childNodes[i].nodeValue;
		}
		text = text.split(/[\s\n]+/);
		for (i = 0; i < text.length; i++) {
			var ll = text[i].split(',');
			if (ll.length < 2) {
				continue;
			}
			coords.push(new L.LatLng(ll[1], ll[0]));
		}
		return coords;
	},

	_read_gxcoords: function (el) {
		var text = '', coords = [];
		text = el.firstChild.nodeValue.split(' ');
		coords.push(new L.LatLng(text[1], text[0]));
		return coords;
	},

	parseGroundOverlay: function (xml) {
		var latlonbox = xml.getElementsByTagName('LatLonBox')[0];
		var bounds = new L.LatLngBounds(
			[
				latlonbox.getElementsByTagName('south')[0].childNodes[0].nodeValue,
				latlonbox.getElementsByTagName('west')[0].childNodes[0].nodeValue
			],
			[
				latlonbox.getElementsByTagName('north')[0].childNodes[0].nodeValue,
				latlonbox.getElementsByTagName('east')[0].childNodes[0].nodeValue
			]
		);
		var attributes = {Icon: true, href: true, color: true};
		function _parse (xml) {
			var options = {}, ioptions = {};
			for (var i = 0; i < xml.childNodes.length; i++) {
				var e = xml.childNodes[i];
				var key = e.tagName;
				if (!attributes[key]) { continue; }
				var value = e.childNodes[0].nodeValue;
				if (key === 'Icon') {
					ioptions = _parse(e);
					if (ioptions.href) { options.href = ioptions.href; }
				} else if (key === 'href') {
					options.href = value;
				} else if (key === 'color') {
					options.opacity = parseInt(value.substring(0, 2), 16) / 255.0;
					options.color = '#' + value.substring(6, 8) + value.substring(4, 6) + value.substring(2, 4);
				}
			}
			return options;
		}
		var options = {};
		options = _parse(xml);
		if (latlonbox.getElementsByTagName('rotation')[0] !== undefined) {
			var rotation = latlonbox.getElementsByTagName('rotation')[0].childNodes[0].nodeValue;
			options.rotation = parseFloat(rotation);
		}
		return new L.RotatedImageOverlay(options.href, bounds, {opacity: options.opacity, angle: options.rotation});
	}

});

L.KMLIcon = L.Icon.extend({
	options: {
		iconSize: [32, 32],
		iconAnchor: [16, 16],
	},
	_setIconStyles: function (img, name) {
		L.Icon.prototype._setIconStyles.apply(this, [img, name]);
		if( img.complete ) {
			this.applyCustomStyles( img )
		} else {
			img.onload = this.applyCustomStyles.bind(this,img)
		}

	},
	applyCustomStyles: function(img) {
		var options = this.options;
		this.options.popupAnchor = [0,(-0.83*img.height)];
		if (options.anchorType.x === 'fraction')
			img.style.marginLeft = (-options.anchorRef.x * img.width) + 'px';
		if (options.anchorType.y === 'fraction')
			img.style.marginTop  = ((-(1 - options.anchorRef.y) * img.height) + 1) + 'px';
		if (options.anchorType.x === 'pixels')
			img.style.marginLeft = (-options.anchorRef.x) + 'px';
		if (options.anchorType.y === 'pixels')
			img.style.marginTop  = (options.anchorRef.y - img.height + 1) + 'px';
	}
});


L.KMLMarker = L.Marker.extend({
	options: {
		icon: new L.KMLIcon.Default()
	}
});

// Inspired by https://github.com/bbecquet/Leaflet.PolylineDecorator/tree/master/src
L.RotatedImageOverlay = L.ImageOverlay.extend({
	options: {
		angle: 0
	},
	_reset: function () {
		L.ImageOverlay.prototype._reset.call(this);
		this._rotate();
	},
	_animateZoom: function (e) {
		L.ImageOverlay.prototype._animateZoom.call(this, e);
		this._rotate();
	},
	_rotate: function () {
        if (L.DomUtil.TRANSFORM) {
            // use the CSS transform rule if available
            this._image.style[L.DomUtil.TRANSFORM] += ' rotate(' + this.options.angle + 'deg)';
        } else if (L.Browser.ie) {
            // fallback for IE6, IE7, IE8
            var rad = this.options.angle * (Math.PI / 180),
                costheta = Math.cos(rad),
                sintheta = Math.sin(rad);
            this._image.style.filter += ' progid:DXImageTransform.Microsoft.Matrix(sizingMethod=\'auto expand\', M11=' +
                costheta + ', M12=' + (-sintheta) + ', M21=' + sintheta + ', M22=' + costheta + ')';
        }
	},
	getBounds: function () {
		return this._bounds;
	}
});


function togglePlaySpeech()
{
	playSpeech = !playSpeech;
	console.log("Play Speech:" + playSpeech);
}

function createTogglers() {		   
    //var html = '<a href="javascript:void(0)" class="closebtn" onclick="closeNav()">x</a>';
      var html = '<div class="overlay-checkbox">';
		 if(playSpeech)
		 {
			html+= '	<input type="checkbox" name="chkSpeech" id="checkSpeech" checked data-mini="true" onclick="togglePlaySpeech()">';
		 }
		 else
		 {
			html+= '	<input type="checkbox" name="chkSpeech" id="checkSpeech" data-mini="true" onclick="togglePlaySpeech()">';
		 }
		 html+= '		<label for="chkSpeech">Play Speech</label>';		 
    html += "</div>";
	for (var i = 0; i < toggleNames.length; i++) {
    			

	    html += "<div class='linediv'>";
	    if (toggleIcons[i] != '')
	    {			
	    	html += '<img src="' + toggleIcons[i] + '" alt="' + toggleNames[i] + '" height="20" width="20">';
	    }
	    else
	    {
	    	html += '<img src="img/DefaultIcon.png" alt="' + toggleNames[i] + '" height="20" width="20">';
	    }
	    html += "<a href='#' onclick='getLayerMarkersHtml(" + i +")' >" + toggleNames[i] + "</a>"
	    html += '<label class="layer-label">';
	    html += "<input type='checkbox' class='layer-checkbox' id='" + toggleNames[i] + "' onclick='toggleKML(" + i +")' checked>'";
	    html += '<span class="layer-slider"></span>';
	    html += '</label>';	    
		html += "</div>";
    }   	
	html += "<\div>"; 

	html += "<div id='layerHeader' class='layerHeader'>";
	html += "</div>";

	html += "<div id='layerItems' class='layerItems'>";
	html += "</div>";

    document.getElementById('overlayContent').innerHTML = html; 
    return html;
};

function toggleKML(layerIndex) {    
    
    
    if (map.hasLayer(toggleLayers[layerIndex]))
	{    
        hideLayer(layerIndex);
	}
	else
	{
        showLayer(layerIndex);
    }                      
    getLayerMarkersHtml(layerIndex);
};


function hideLayer(layerIndex) {		   
		var x = toggleLayers[layerIndex];		
		map.removeLayer(x);			
};
	
function showLayer(layerIndex) {			   
		var x = toggleLayers[layerIndex];		
		map.addLayer(x);				
};


function ClearMap()
{
	for (var layerId = 0; layerId < toggleLayers.length; layerId++) {        
        var layer = toggleLayers[layerId]; 
        // Lat, long of current point as it loops through.        
        if (map.hasLayer(layer)) {
			map.removeLayer(layer);
		}
	}
	
	toggleLayers = [];
	toggleNames = [];
	toggleIcons = [];
	markers = [];
}


function setPlaySpeechCheckbox()
{
	//$("#estado_cat").prop( "checked", playSpeech );
}

function loadKmlFile(kmlFile) {
    console.log("loadKmlFile");
    kmlFile = "kml/" + kmlFile
    fetch(kmlFile)
		.then( res => res.text() )
		.then( kmltext => {
		    // Create new kml overlay           
		    parser = new DOMParser();
            kml = parser.parseFromString(kmltext,"text/xml");			            
            const track = new L.KMLLayerGroups(kml)                
            map.addLayer(track)

            // Adjust map to show the kml
            const bounds = track.getBounds()
            map.fitBounds( bounds )
            
            createTogglers();    
            setPlaySpeechCheckbox();
            currentKml = kmlFile;      
        })                        
};


function getIconUrl(folderKml, style) {	
	var styles = folderKml.getElementsByTagName('styleUrl');
	var iconKey = '';
	var iconUrl = 'img/DefaultIcon.png'; //default (effectively for routes/lines)
	if (styles.length > 0)	
	{			    
		var styleElement = styles[0];		
		iconKey = styleElement.childNodes[0].nodeValue;				
		iconKey = iconKey + "-normal";		
		var style = style[iconKey];		
		var icon = style["icon"];		
		if (icon)
		{
		    var options = icon["options"];		    
		    if (options)
		    {
		        iconUrl = options["iconUrl"];		        		      
		    }
		}
	}		
	return iconUrl;
};


function triggerPopup(leafletId){    
	console.log("triggerPopup");
    var marker = map._layers[leafletId];
    if (marker)
    {
       ProcessLocalMarker(marker, true);			
    }    
}


function ShowMarker(marker)
{
	 marker.openPopup();
}

function ProcessClick(lat, lon){
	console.log("ProcessClicks" + lat + "," + lon);	
    ProcessLocation(lat,lon);
}

function ProcessLocation(lat,lon){
	// get markers near this location and do something 
	console.log("ProcessLocation");	
    var localPoints = SelectPoints(lat,lon);
    for (var i = 0; i < localPoints.length; i++) {
		console.log("ProcessMarker ");
        ProcessLocalMarker(localPoints[i], false);
    }
}

function MarkerPlayed(marker)
{
	return jQuery.inArray(marker, playedMarkers) !== -1;
}

function ProcessLocalMarker(marker, ignorePlayed) {      
    var popup = marker._popup;
	console.log("ProcessLocalMarker");
	console.log(marker);
		
    if (popup)
    {		
        var content = urlify(popup.getContent());
		console.log(content);
        if (content)
        {	
			ShowMarker(marker);	
		   if(playSpeech)
		   {
				if (!MarkerPlayed(marker)|| ignorePlayed)
				{
					console.log("Play Marker " + marker._leaflet_id);
					PlayMarkerSpeech(content);
					if (!ignorePlayed)  // marker triggered by click in slider so don't stop playing from near by triggering.
					{
						playedMarkers.push(marker);	
						RefreshMarkerToggleColor(marker);			
					}
				}
				else
				{
					console.log("MarkerPlayed Alredy and nearby: " + marker._leaflet_id);
				}
		    }
		    
        }
    }
}

function RefreshMarkerToggleColor(marker)
{
	console.log("RefreshPlayedColor " + marker._leaflet_id);
	var markerAnchor = $("marker_" + marker._leaflet_id);
	if (markerAnchor != null)
	{
		console.log("Added Class to anchor");
		$("marker_" + marker._leaflet_id).addClass("playedMarker");
	}
	else
	 console.log("Marker anchor not found");
}

function PlayMarkerSpeech(content)
{

	console.log("Play Speech");
 	// split the header if there is one.
 	var noAnchorContent = stripAnchorThisLink(content);
 	console.log(noAnchorContent);
	var titleStart = noAnchorContent.indexOf('<h2>') + 4;
	var titleEnd = noAnchorContent.indexOf('</h2>');
	var contentStart = 0;	
	var title = "";
	
	//Get the title and beginning of the content if there is a H2 tag
	if (titleStart > 0 && titleEnd > 0)
	{
		title = noAnchorContent.substring(titleStart,titleEnd);		
		contentStart = titleEnd + 5;						
	}
	
	if (title != "")
	{
		// play title
		 var titleMsg = new SpeechSynthesisUtterance(title);
            window.speechSynthesis.speak(titleMsg);
	}

	// play content
	 var msg = new SpeechSynthesisUtterance(noAnchorContent.substring(contentStart));
     window.speechSynthesis.speak(msg);
}


function SelectPoints(lat,lon){        
	// Get all markers within a radious of this location
    xy = [lat,lon];  //center point of circle
	
    var theRadius = 20; //meters
    
	
	
    var selPts = [];
    selPts.length =0;  //Reset the array if selecting new points
	
    for (var layerId = 0; layerId < toggleLayers.length; layerId++) {        
        var layer = toggleLayers[layerId]; 
        // Lat, long of current point as it loops through.        
        if (map.hasLayer(layer)) {

            var markers = [];               
            markers = getLayerMarkers(layerId);            
            for (var i = 0; i < markers.length; i++) {
                var marker = markers[i];
                if (map.hasLayer(marker))
                {                      
                    try
                    {						
                        var marker_lat_long = marker.getLatLng();		
                        // Distance from our circle marker To current point in meters
                        var distance_from_centerPoint = marker_lat_long.distanceTo(xy);	                        
                        // See if meters is within radius, add the to array
                        //console.log("Distance:" + distance_from_centerPoint);
                        if (distance_from_centerPoint <= theRadius) {                            
                            selPts.push(marker);                              
                            //console.log(marker);
                        }
                    }
                    catch(err)
                    {
                        // ignore markers with no location i.e. lines
                    }
                }
            };            
        }
    };    
    return selPts;
};	//end of SelectPoints function

function getLayerMarkersHtml(layerId){
    // layer header

    var markers = [];
    var html;    
    var layer = toggleLayers[layerId];    
    html = '';
    markers = getLayerMarkers(layerId);

    for (var i = 0; i < markers.length; i++) {
        var marker = markers[i];
        if (map.hasLayer(marker))
        {                      
            var popup = marker._popup;
            if (popup)
            {				
                var content = popup.getContent();
                if (content)
                {
					console.log(content);
                    var arr = content.split('</h2>')
                    var heading = arr[0].replace('<h2>','');
                    html += "<li>"
                    html += "<img src='" + toggleIcons[layerId] + "'/>";
                    if(!MarkerPlayed(marker))
                    {
						 console.log("LayerItem marker not played" + marker._leaflet_id);
                       html += "<a href='#' id='marker_" + marker._leaflet_id + "' onclick='triggerPopup(" + marker._leaflet_id + ")'>" + heading + "</a>"
                    }
                    else
                    {
					   console.log("LayerItem marker played "  + marker._leaflet_id);
                       html += "<a href='#' id='marker_" + marker._leaflet_id + "' onclick='triggerPopup(" + marker._leaflet_id + ")' class='playedMarker'>" + heading + "</a>"
                    }
                    
                    html += "</li>";                    
                }
            }           
        }
    };
                       
    if (html != '')
    {
        html = "<ul>" +  html + "</ul>";
        document.getElementById("layerItems").innerHTML = html;
        
        html = "<br><a href='#'>" + toggleNames[layerId] + "</a>";
        document.getElementById("layerHeader").innerHTML = html;    
    }
    else
    {
        document.getElementById("layerItems").innerHTML = '';
        document.getElementById("layerHeader").innerHTML = '';    
    }
    return null;
}

function getLayerMarkers(layerId)
{   
    var layer = toggleLayers[layerId];   
    var markers = [];
	console.log("GetLayMarkers");
    layer.eachLayer(function (marker)
    {
        if (map.hasLayer(marker))
        {                      
            var popup = marker._popup;
            if (popup)
            {
                var content = popup.getContent();
                if (content)
                {
                    markers.push(marker);
                }
            }           
        }
    });                       
   return markers;
}

$(document).ready(function() {
	console.log("Document Ready");
	// Load bootstrap.json, initialise the bootstrap variables and call appInit
	$.getJSON('bootstrap.json', function(data) {
		appPlatform = data.platform;
		mapEndpoint = data[appPlatform].map_endpoint;	
		console.log(mapEndpoint);		
		appInit();			
	});	
	
	//TODO - if a refresh occurs on map page - change to main page, N.B. Probably not required for mobile, but useful for web app.
	//if ($(location).attr('href').includes("map-page"))
	//{
	//	$.mobile.changePage( "#main-page");		
	//}
});




function ResetMap()
{
	console.log("Reset Map");
	if (map!= null)
	{
		map.off();
		map.remove();
		
		toggleLayers = [];
		toggleNames = [];
		toggleIcons = [];
		markers = [];	
		playedMarkers = [];		
	};
	
			
	map = L.map('map').setView([51.436782, -2.581444], defaultZoomLevel);
        mapLink = 
            '<a href="http://openstreetmap.org">OpenStreetMap</a>';
        L.tileLayer(
            'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attributionControl: false,            
			id: 'mapbox/streets-vll'
            }).addTo(map);
            
            console.log("Add locate");
			L.control.locate({
						locateOptions: {
									enableHighAccuracy: true
						}}).addTo(map);
				

		map.on('locationfound', onLocationFound);
		map.locate({setView: true, watch: true});

        map.on('click', function (e) {
            lat = e.latlng.lat;
            lon = e.latlng.lng;
            ProcessClick(lat, lon)
        });       
}


function onLocationFound(e) {
    console.log("Location Found");	
	//var radius = e.accuracy / 2;
	//L.marker(e.latlng).addTo(map)
	//	.bindPopup("You are within " + radius + " meters from this point").openPopup();
	//L.circle(e.latlng, radius).addTo(map);
	ProcessLocation(e.lat, e.lng);
	if (followMe)
	{
		map.panTo(e.latlng);
	}
}


function StartRoute(name, kmlFile)
{
	$.mobile.changePage( "#map-page");

	console.log("Start route " + name);		
	selectedName = name;
	selectedKml = kmlFile;	
	if (selectedKml != currentKml)
	 {	
		if (currentKml != "")
		{
			ResetMap();			
		};	
		//map.invalidateSize();  		
		
		
		downloadCheck(selectedKml);
		loadKmlFile(selectedKml);
		currentName = selectedName;
		currentKml = selectedKml;
	 }	 		
}


$(document).on("pagechange", function(toPage) {
    if(toPage.currentTarget.URL.includes("map-page"))
	{
		console.log("Change page to map");
		// Long titles cause the title to wrap - TODO
	   //	$('#mapTitle').text(currentName);
	   //	alert($('#mapTitle').text());
		
		// refresh and center the route
		map.invalidateSize();  	
		map.setView([51.436782, -2.581444],defaultZoomLevel);		
	}
	
});

var appInit = function() {
	
	console.log("App init");
	console.log(mapEndpoint);	
	//store = cordova.file.dataDirectory;
	//console.log(store);
	// Retrieve the KML file groups	
	//$.getJSON('kml/kmlData.txt', function(data) {	
	$.getJSON(mapEndpoint + '/skyline/get-kml-file-groupsv4.php', function(data) {		
	  jsonArray += "{";			
		// Build the map links on the homepage for #main-page-map-buttons		
		$.each(data, function(i, item) {			
			jsonArray += '"' + item.kmlFileGroupName + '":' 
		    kmlFileGroup = item.categories;						
			var routeHtml  = '<div class="welcomemapbutton"> '
			routeHtml += ' <img src="img/' + item.routeImage  + '"  style="vertical-align:middle"/> ' 			
			routeHtml +=  item.routeName;
			routeHtml += '<br/> <br/> ';			
			routeHtml +=  urlify(item.routeDescription) + '<br/> <br/> ';			
			routeHtml += '<button  class="routeStartLink" onClick=StartRoute("' + item.routeName.trim().replace(/ /g, '%20') + '","' + item.routeKmlFile + '")>Start Route</button>'			
			jsonArray += JSON.stringify(item.categories) + ",";			
			routeHtml += ' </div>';
			//routeHtml +=  '<br/> ';			
			$('#main-page-map-buttons').append(routeHtml);						
		});		
								
		jsonArray = jsonArray.slice(0,-1); // remove last comma		
		jsonArray += "}";		
		
		
	}).fail(function(jqXHR, textStatus, errorThrown) { alert('getJSON request failed! ' + textStatus); });	
		
}

function urlify(text) {
  var urlRegex = /(([a-z]+:\/\/)?(([a-z0-9\-]+\.)+([a-z]{2}|aero|arpa|biz|com|coop|edu|gov|info|int|jobs|mil|museum|name|nato|net|org|pro|travel|local|internal))(:[0-9]{1,5})?(\/[a-z0-9_\-\.~]+)*(\/([a-z0-9_\-\.]*)(\?[a-z0-9+_\-\.%=&amp;]*)?)?(#[a-zA-Z0-9!$&'()*+.=-_~:@/?]*)?)(\s+|$)/gi;
  return text.replace(urlRegex, function(url) {
    return '<a href="#" onclick="window.open(encodeURI(\'' + addHTTP(url) + '\'),\'_system\',\'location=yes\');">' + url + '</a>';
  })
  //kLINK_DETECTION_REGEX = /(([a-z]+:\/\/)?(([a-z0-9\-]+\.)+([a-z]{2}|aero|arpa|biz|com|coop|edu|gov|info|int|jobs|mil|museum|name|nato|net|org|pro|travel|local|internal))(:[0-9]{1,5})?(\/[a-z0-9_\-\.~]+)*(\/([a-z0-9_\-\.]*)(\?[a-z0-9+_\-\.%=&amp;]*)?)?(#[a-zA-Z0-9!$&'()*+.=-_~:@/?]*)?)(\s+|$)/gi
  
  // or alternatively
  // return text.replace(urlRegex, '<a href="$1">$1</a>')
}


function stripAnchorThisLink(text)
{	
	return text.replace(/<a\b[^>]*>(.*?)<\/a>/i," link to website address ");
}


function downloadCheck(kmlFile)
{
	console.log('Download check ' + kmlFile);
	//var store = cordova.file.dataDirectory;
	console.log(kmlFile);	
	//checkIfFileExists('kml/' + kmlFile);
}

function checkIfFileExists(path){
    // path is the full absolute path to the file.
    window.resolveLocalFileSystemURL(path, fileExists, fileDoesNotExist);
}
function fileExists(fileEntry){
    alert("File " + fileEntry.fullPath + " exists!");
}
function fileDoesNotExist(fileEntry){
    alert("file does not exist" + fileEntry.fullPath);
}
function getFSFail(evt) {
    console.log(evt.target.error.code);
}


function downloadAsset(fileName) {
	var fileTransfer = new FileTransfer();
	console.log("About to start transfer");
	fileTransfer.download(assetURL, store + fileName, 
		function(entry) {
			console.log("Success!");			
		}, 
		function(err) {
			console.log("Error");
			console.dir(err);
		});
}


function addHTTP(text)
{
   if (text.startsWith("http"))
		return text;
  
   return 'https://' + text;
}

function urlify2(text) {
  var urlRegex = /(([a-z]+:\/\/)?(([a-z0-9\-]+\.)+([a-z]{2}|aero|arpa|biz|com|coop|edu|gov|info|int|jobs|mil|museum|name|nato|net|org|pro|travel|local|internal))(:[0-9]{1,5})?(\/[a-z0-9_\-\.~]+)*(\/([a-z0-9_\-\.]*)(\?[a-z0-9+_\-\.%=&amp;]*)?)?(#[a-zA-Z0-9!$&'()*+.=-_~:@/?]*)?)(\s+|$)/gi;
  return text.replace(urlRegex, function(url) {
    return '<a href="' + url + '">' + url + '</a>';
  })
  //kLINK_DETECTION_REGEX = /(([a-z]+:\/\/)?(([a-z0-9\-]+\.)+([a-z]{2}|aero|arpa|biz|com|coop|edu|gov|info|int|jobs|mil|museum|name|nato|net|org|pro|travel|local|internal))(:[0-9]{1,5})?(\/[a-z0-9_\-\.~]+)*(\/([a-z0-9_\-\.]*)(\?[a-z0-9+_\-\.%=&amp;]*)?)?(#[a-zA-Z0-9!$&'()*+.=-_~:@/?]*)?)(\s+|$)/gi
  
  // or alternatively
  // return text.replace(urlRegex, '<a href="$1">$1</a>')
}


function followMeEnabled() {

    var imgUp = "img/1.jpg";
    var imgDown = "img/2.jpg";
	var theImage = document.getElementById("followMe");
	var theState = theImage.src;
	
	return (theState.indexOf(imgUp) != -1);
}

function openNav() {	
  document.getElementById("myNav").style.width = "19em";
  
}

function closeNav() {
  document.getElementById("myNav").style.width = "0%";
}


