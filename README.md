silence-js
===========

simple but enough web framework

Example
------


Interface
------

#### DatabaseStore


* `exec`
arguments: (queryString, queryParams)
return:  Promise
resolve:
````js
{
  affectedRows: 0, // affected rows count
  insertId: xxx, // last insert id
}
````


* `query`
arguments:   (queryString, queryParams)
return:      Promise
resolve:     Array of db rows

* `initField`
arguments:   (field)
return:      undefined

* `genCreateTableSQL`
arguments:   (Model)
return:      string of create table SQL
