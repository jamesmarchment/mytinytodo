<?php

/*
	(C) Copyright 2009,2019,2021 Max Pozdeev <maxpozdeev@gmail.com>
	Licensed under the GNU GPL v2 license. See file COPYRIGHT for details.
*/

// ---------------------------------------------------------------------------- //
class DatabaseResult_Mysql extends DatabaseResult_Abstract
{
	private $q; //mysqli_result

	function __construct(mysqli $dbh, $query, $resultless = 0)
	{
		$this->q = $dbh->query($query); //throws mysqli_sql_exception
	}

	function fetchRow()
	{
		return $this->q->fetch_row();
	}

	function fetchAssoc()
	{
		return $this->q->fetch_assoc();
	}
}

// ---------------------------------------------------------------------------- //
class Database_Mysql extends Database_Abstract
{
	private $dbh; //mysqli
	private $dbname;
	var $prefix = '';

	function __construct()
	{
		// enable throwing exceptions
		mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
	}

	function connect($params)
	{
		$host = $params['host'];
		$user = $params['user'];
		$pass = $params['password'];
		$db = $params['db'];
		$this->dbname = $db;
		$this->dbh = new mysqli($host, $user, $pass, $db); //throws mysqli_sql_exception
		return true;
	}

	function lastInsertId($name = null)
	{
		return $this->dbh->insert_id;
	}

	function sq($query, $p = NULL)
	{
		$q = $this->_dq($query, $p);

		$res = $q->fetchRow();
		if ($res === false || $res === null) return NULL;

		if (sizeof($res) > 1) return $res;
		else return $res[0];
	}

	function sqa($query, $p = NULL)
	{
		$q = $this->_dq($query, $p);

		$res = $q->fetchAssoc();
		if ($res === false || $res === null) return NULL;

		return $res;
	}

	function dq($query, $p = NULL) : DatabaseResult_Abstract
	{
		return $this->_dq($query, $p);
	}

	/*
		for resultless queries like INSERT,UPDATE,DELETE
	*/
	function ex($query, $p = NULL)
	{
		$dbr = $this->_dq($query, $p, 1);
		return $this->affected();
	}

	private function _dq($query, $p = NULL, $resultless = 0) : DatabaseResult_Abstract
	{
		if (!isset($p)) $p = array();
		elseif (!is_array($p)) $p = array($p);

		$m = explode('?', $query);

		if (sizeof($p) > 0)
		{
			if (sizeof($m) < sizeof($p)+1) {
				throw new Exception("params to set MORE than query params");
			}
			if (sizeof($m) > sizeof($p)+1) {
				throw new Exception("params to set LESS than query params");
			}
			$query = "";
			for ($i=0; $i < sizeof($m)-1; $i++) {
				$query .= $m[$i]. (is_null($p[$i]) ? 'NULL' : $this->quote($p[$i]));
			}
			$query .= $m[$i];
		}
		$this->lastQuery = $query;
		return new DatabaseResult_Mysql($this->dbh, $query, $resultless);
	}

	function affected()
	{
		return $this->dbh->affected_rows;
	}

	function quote($s)
	{
		return '\''. addslashes($s). '\'';
	}

	function quoteForLike($format, $s)
	{
		$s = str_replace(array('%','_'), array('\%','\_'), addslashes($s));
		return '\''. sprintf($format, $s). '\'';
	}

	function tableExists($table)
	{
		$r = $this->sq("SELECT 1 FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
						array($this->dbname, $table) );
		if ($r === false || $r === null) return false;
		return true;
	}
}

?>