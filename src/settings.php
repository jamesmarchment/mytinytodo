<?php

/*
	This file is part of myTinyTodo.
	(C) Copyright 2009-2011,2020 Max Pozdeev <maxpozdeev@gmail.com>
	Licensed under the GNU GPL v2 license. See file COPYRIGHT for details.
*/

require_once('./init.php');

$lang = Lang::instance();

if ( !is_logged() )
{
	die("Access denied!<br/> Disable password protection or Log in.");
}

if(isset($_POST['save']))
{
	$t = array();
	$langs = getLangs();
	Config::$params['lang']['options'] = array_keys($langs);
	Config::set('lang', _post('lang'));

	// in Demo mode we can set only language by cookies
	if(defined('MTTDEMO')) {
		setcookie('lang', Config::get('lang'), 0, url_dir(Config::get('url')=='' ? getRequestUri() : Config::getUrl('url')));
		$t['saved'] = 1;
		jsonExit($t);
	}

	if(isset($_POST['password']) && $_POST['password'] != '') Config::set('password', $_POST['password']);
	elseif(!_post('allowpassword')) Config::set('password', '');
	Config::set('smartsyntax', (int)_post('smartsyntax'));
	// Do not set invalid timezone
	try {
	    $tz = trim(_post('timezone'));
	    $testTZ = new DateTimeZone($tz); //will throw Exception on invalid timezone
	    Config::set('timezone', $tz);
	}
	catch (Exception $e) {
	}
	Config::set('autotag', (int)_post('autotag'));
	Config::set('firstdayofweek', (int)_post('firstdayofweek'));
	Config::set('clock', (int)_post('clock'));
	Config::set('dateformat', _post('dateformat'));
	Config::set('dateformat2', _post('dateformat2'));
	Config::set('dateformatshort', _post('dateformatshort'));
	Config::set('title', trim(_post('title')));
	Config::set('showdate', (int)_post('showdate'));
	Config::save();
	$t['saved'] = 1;
	jsonExit($t);
}

$oldLangs = getOldLangs(1);
if (is_array($oldLangs) && count($oldLangs) == 0) $oldLangs = 0;


function _c($key)
{
	return Config::get($key);
}

function getLangs($withContents = 0)
{
	$langDir = Lang::instance()->langDir();
    if ( ! $h = opendir($langDir) ) {
			return false;
	}
    $a = array();
    while ( false !== ($file = readdir($h)) )
	{
		if ( preg_match('/(.+)\.json$/', $file, $m) ) {
			$jsonText = file_get_contents($langDir. $file);
			if (false === $jsonText) {
				die("false ");
				continue;
			}
			$a[$m[1]] = $m[1];

			$j = json_decode($jsonText, true);
			if ( isset($j['_header']['language']) && isset($j['_header']['original_name']) ) {
				$a[$m[1]]= [
					'name' => $j['_header']['original_name'],
					'title' => $j['_header']['language']
				];
			}
		}
    }
    closedir($h);
    return $a;
}

/* deprecated */
function getOldLangs($withContents = 0)
{
    if (!$h = @opendir(MTTPATH. 'lang')) return false;
    $a = array();
    while(false !== ($file = readdir($h)))
	{
		if(preg_match('/(.+)\.php$/', $file, $m) && $file != 'class.default.php') {
			$a[$m[1]] = $m[1];
			if($withContents) {
			    $a[$m[1]] = getOldLangDetails(MTTPATH. 'lang'. DIRECTORY_SEPARATOR. $file, $m[1]);
			    $a[$m[1]]['name'] = $a[$m[1]]['original_name'];
			    $a[$m[1]]['title'] = $a[$m[1]]['language'];
			}
		}
    }
    closedir($h);
    return $a;
}

/* deprecated */
function getOldLangDetails($filename, $default)
{
    $contents = file_get_contents($filename);
    $a = array('language'=>$default, 'original_name'=>$default);
    if(preg_match("|/\\*\s*myTinyTodo language pack([\s\S]+?)\\*/|", $contents, $m))
	{
	    $str = $m[1];
	 	if(preg_match("|Language\s*:\s*(.+)|i", $str, $m)) {
			$a['language'] = trim($m[1]);
		}
		if(preg_match("|Original name\s*:\s*(.+)|i", $str, $m)) {
			$a['original_name'] = trim($m[1]);
		}
	}
	return $a;
}

function selectOptions($a, $value, $default=null)
{
	if(!$a) return '';
	$s = '';
	if($default !== null && !isset($a[$value])) $value = $default;
	foreach($a as $k=>$v) {
		$s .= '<option value="'.htmlspecialchars($k).'" '.($k===$value?'selected="selected"':'').'>'.htmlspecialchars($v).'</option>';
	}
	return $s;
}

/**
 * @param array $a             array of id=>array(name, optional title)
 * @param mixed $key           Key of OPTION to be selected
 * @param mixed $default       Default key if $key is not present in $a
 */
function selectOptionsA($a, $key, $default=null)
{
	if(!$a) return '';
	$s = '';
	if($default !== null && !isset($a[$key])) $key = $default;
	foreach($a as $k=>$v) {
		$s .= '<option value="'.htmlspecialchars($k).'" '.($k===$key?'selected="selected"':'').
		    (isset($v['title']) ? ' title="'.htmlspecialchars($v['title']).'"' : '').
		    '>'.htmlspecialchars($v['name']).'</option>';
	}
	return $s;
}

function timezoneIdentifiers()
{
    $zones = DateTimeZone::listIdentifiers();
    $a = array();
    foreach($zones as $v) {
        $a[$v] = $v;
    }
    return $a;
}

header('Content-type:text/html; charset=utf-8');
?>

<h3 class="page-title"><a class="mtt-back-button"></a><?php _e('set_header');?></h3>

<div id="settings_msg" style="display:none"></div>

<form id="settings_form" method="post" action="settings.php">

<div class="mtt-settings-table">

<div class="tr">
  <div class="th"> <?php _e('set_title');?>:<br/><span class="descr"><?php _e('set_title_descr');?></span></div>
  <div class="td"> <input name="title" value="<?php echo htmlspecialchars(_c('title'));?>" class="in350" autocomplete="off" /> </div>
</div>

<div class="tr">
<div class="th"><?php _e('set_language');?>:</div>
<div class="td">
	<select name="lang"><?php echo selectOptionsA(getLangs(), _c('lang')); ?></select>
	<?php if ($oldLangs) { ?>
	<br><br>
	<b>Notice!</b> You can use old language files after downloading in the new format and copying to the <i>/content/lang/</i> folder.<br>
	<select id="mtt_old_langs"><?php echo selectOptionsA( $oldLangs, _c('lang'), 'en'); ?></select>
	<a id="mtt_old_langs_link" href="<?php mttinfo('mtt_url')?>mytinytodo_lang.php?jsonfile">Download json file</a>
	<script type="text/javascript">
	$('#mtt_old_langs').on('change', function(){
		$('#mtt_old_langs_link').attr('href', mytinytodo.mttUrl + 'mytinytodo_lang.php?jsonfile&lang=' + $(this).val());
	});
	$('#mtt_old_langs_link').attr('href', mytinytodo.mttUrl + 'mytinytodo_lang.php?jsonfile&lang=' + $('#mtt_old_langs').val());
	</script>
	<?php } ?>
</div>
</div>

<div class="tr">
<div class="th"><?php _e('set_protection');?>:</div>
<div class="td">
 <label><input type="radio" name="allowpassword" value="1" <?php if(_c('password')!='') echo 'checked="checked"'; ?> onclick='$(this.form).find("input[name=password]").attr("disabled",false)' /><?php _e('set_enabled');?></label> <br/>
 <label><input type="radio" name="allowpassword" value="0" <?php if(_c('password')=='') echo 'checked="checked"'; ?> onclick='$(this.form).find("input[name=password]").attr("disabled","disabled")' /><?php _e('set_disabled');?></label> <br/>
</div></div>

<div class="tr">
<div class="th"><?php _e('set_newpass');?>:<br/><span class="descr"><?php _e('set_newpass_descr');?></span></div>
<div class="td"> <input type="password" name="password" <?php if(_c('password')=='') echo "disabled"; ?> /> </div>
</div>

<div class="tr">
<div class="th"><?php _e('set_smartsyntax');?>:<br/><span class="descr"><?php _e('set_smartsyntax2_descr');?></span></div>
<div class="td">
 <label><input type="radio" name="smartsyntax" value="1" <?php if(_c('smartsyntax')) echo 'checked="checked"'; ?> /><?php _e('set_enabled');?></label> <br/>
 <label><input type="radio" name="smartsyntax" value="0" <?php if(!_c('smartsyntax')) echo 'checked="checked"'; ?> /><?php _e('set_disabled');?></label>
</div></div>

<div class="tr">
<div class="th"><?php _e('set_autotag');?>:<br/><span class="descr"><?php _e('set_autotag_descr');?></span></div>
<div class="td">
 <label><input type="radio" name="autotag" value="1" <?php if(_c('autotag')) echo 'checked="checked"'; ?> /><?php _e('set_enabled');?></label> <br/>
 <label><input type="radio" name="autotag" value="0" <?php if(!_c('autotag')) echo 'checked="checked"'; ?> /><?php _e('set_disabled');?></label>
</div></div>

<div class="tr">
<div class="th"><?php _e('set_timezone');?>:</div>
<div class="td">
 <select name="timezone"><?php echo selectOptions(timezoneIdentifiers(), _c('timezone')); ?></select>
</div></div>

<div class="tr">
<div class="th"><?php _e('set_firstdayofweek');?>:</div>
<div class="td">
 <select name="firstdayofweek"><?php echo selectOptions(__('days_long'), _c('firstdayofweek')); ?></select>
</div></div>

<div class="tr">
<div class="th"><?php _e('set_date');?>:</div>
<div class="td">
 <input name="dateformat" size="8" value="<?php echo htmlspecialchars(_c('dateformat'));?>" />
 <select onchange="if(this.value!=0) this.form.dateformat.value=this.value;">
 <?php echo selectOptions(array('F j, Y'=>formatTime('F j, Y'), 'M d, Y'=>formatTime('M d, Y'), 'j M Y'=>formatTime('j M Y'), 'd F Y'=>formatTime('d F Y'),
	'n/j/Y'=>formatTime('n/j/Y'), 'd.m.Y'=>formatTime('d.m.Y'), 'j. F Y'=>formatTime('j. F Y'), 0=>__('set_custom')), _c('dateformat'), 0); ?>
 </select>
</div></div>

<div class="tr">
<div class="th"><?php _e('set_date2');?>:</div>
<div class="td">
 <input name="dateformat2" size="8" value="<?php echo htmlspecialchars(_c('dateformat2'));?>" />
 <select onchange="if(this.value!=0) this.form.dateformat2.value=this.value;">
 <?php echo selectOptions(array(
       'Y-m-d'=>'yyyy-mm-dd ('.date('Y-m-d').')',
       'n/j/y'=>'m/d/yy ('.date('n/j/y').')',
       'd.m.y'=>'dd.mm.yy ('.date('d.m.y').')',
       'd/m/y'=>'dd/mm/yy ('.date('d/m/y').')',
       0=>__('set_custom')), _c('dateformat2'), 0);  ?>
 </select>
</div></div>

<div class="tr">
<div class="th"><?php _e('set_shortdate');?>:</div>
<div class="td">
 <input name="dateformatshort" size="8" value="<?php echo htmlspecialchars(_c('dateformatshort'));?>" />
 <select onchange="if(this.value!=0) this.form.dateformatshort.value=this.value;">
 <?php echo selectOptions(array('M d'=>formatTime('M d'), 'j M'=>formatTime('j M'), 'n/j'=>formatTime('n/j'), 'd.m'=>formatTime('d.m'), 0=>__('set_custom')), _c('dateformatshort'), 0); ?>
 </select>
</div></div>

<div class="tr">
<div class="th"><?php _e('set_clock');?>:</div>
<div class="td">
 <select name="clock"><?php echo selectOptions(array(12=>__('set_12hour').' ('.date('g:i A').')', 24=>__('set_24hour').' ('.date('H:i').')'), _c('clock')); ?></select>
</div></div>

<div class="tr">
<div class="th"><?php _e('set_showdate');?>:</div>
<div class="td">
 <label><input type="radio" name="showdate" value="1" <?php if(_c('showdate')) echo 'checked="checked"'; ?> /><?php _e('set_enabled');?></label> <br/>
 <label><input type="radio" name="showdate" value="0" <?php if(!_c('showdate')) echo 'checked="checked"'; ?> /><?php _e('set_disabled');?></label>
</div>
</div>

<div class="tr form-bottom-buttons">
  <input type="submit" value="<?php _e('set_submit');?>" />
  <input type="button" class="mtt-back-button" value="<?php _e('set_cancel');?>" />
</div>

</div>

</form>